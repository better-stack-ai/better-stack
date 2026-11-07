import type { DBAdapter as Adapter } from "@btst/db";
import { z } from "zod";
import type {
	DigitalGrant,
	DigitalGrantRecord,
	Order,
	OrderLineItem,
	OrderRecord,
	Product,
} from "../types";
import { getOrder } from "./getters";
import { ecommerceError as fail, productSnapshot } from "./mutations";
import { serializeOrder } from "./serializers";

/** Private source snapshot supplied only to trusted delivery adapters. */
export interface DigitalDeliveryContext {
	/** Durable idempotency key. Grant and revoke must be idempotent; revoke is terminal. */
	grantId: string;
	orderId: string;
	resourceId: string;
	quantity: number;
	customerId: string | null;
}
/** Providers must persist idempotency by grantId, including terminal revocation across late grant retries. */
export interface DigitalFulfillmentAdapter {
	grant(context: DigitalDeliveryContext): Promise<void>;
	revoke(context: DigitalDeliveryContext): Promise<void>;
	download?(context: DigitalDeliveryContext): Promise<Response>;
}
/** Optional checkout snapshot resolver and server-side delivery providers. */
export interface DigitalFulfillmentConfig {
	/** Called at checkout with server-loaded product data. Its result is stored privately and never re-resolved after payment. */
	resolveItem(context: { product: Product; lineItem: OrderLineItem }):
		| { adapter: string; resourceId: string; expiresInSeconds?: number }
		| null
		| Promise<{
				adapter: string;
				resourceId: string;
				expiresInSeconds?: number;
		  } | null>;
	adapters: Record<string, DigitalFulfillmentAdapter>;
}
/** Streams private storage through the authorized delivery route; never publishes a permanent asset URL. */
export function protectedDownloadAdapter(options: {
	read(
		context: DigitalDeliveryContext,
	): Promise<{ body: BodyInit; filename: string; contentType?: string }>;
}): DigitalFulfillmentAdapter {
	return {
		async grant() {},
		async revoke() {},
		async download(context) {
			const file = await options.read(context);
			return new Response(file.body, {
				headers: {
					"content-type": file.contentType ?? "application/octet-stream",
					"content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
					"cache-control": "private, no-store",
					"x-content-type-options": "nosniff",
				},
			});
		},
	};
}
const deliverySchema = z.object({
	adapter: z.string().min(1).max(100),
	resourceId: z.string().min(1).max(2048),
	expiresInSeconds: z.number().int().min(1).max(315360000).optional(),
});
export async function deliveryTokenHash(token: string) {
	return Array.from(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
		),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
}
export function createDigitalFulfillment(
	adapter: Adapter,
	config?: DigitalFulfillmentConfig,
) {
	async function records(orderId: string) {
		return adapter.findMany<DigitalGrantRecord>({
			model: "ecommerceDigitalGrant",
			where: [{ field: "orderId", value: orderId }],
			limit: 50,
			sortBy: { field: "itemIndex", direction: "asc" },
		});
	}
	function safe(record: DigitalGrantRecord): DigitalGrant {
		return {
			id: record.id,
			orderId: record.orderId,
			itemIndex: record.itemIndex,
			name: record.name,
			quantity: record.quantity,
			adapter: record.adapter,
			status: record.status,
			expiresAt: record.expiresAt
				? new Date(record.expiresAt).toISOString()
				: null,
			downloadable: Boolean(config?.adapters[record.adapter]?.download),
			lastError: record.lastError ?? null,
		};
	}
	async function order(record: OrderRecord): Promise<Order> {
		const grants = await records(record.id);
		return {
			...serializeOrder(record),
			...(grants.length ? { deliveryGrants: grants.map(safe) } : {}),
		};
	}
	async function snapshot(
		tx: Pick<Adapter, "findOne" | "create">,
		purchased: OrderRecord,
		lines: OrderLineItem[],
	) {
		if (!config) return;
		for (const [itemIndex, line] of lines.entries()) {
			// The reservation already validated this CMS record in the same transaction.
			const { item, data } = await productSnapshot(tx, line.productId);
			const resolved = await config.resolveItem({
				product: {
					...data,
					id: item.id,
					slug: item.slug,
					createdAt: String(item.createdAt),
					updatedAt: String(item.updatedAt),
				},
				lineItem: { ...line },
			});
			if (!resolved) continue;
			const input = deliverySchema.parse(resolved);
			if (!Object.hasOwn(config.adapters, input.adapter))
				fail(500, "Digital delivery adapter is not configured");
			await tx.create<DigitalGrantRecord>({
				model: "ecommerceDigitalGrant",
				data: {
					key: JSON.stringify([purchased.id, itemIndex]),
					orderId: purchased.id,
					itemIndex,
					name: line.name,
					quantity: line.quantity,
					adapter: input.adapter,
					resourceId: input.resourceId,
					status: "pending",
					expiresInSeconds: input.expiresInSeconds ?? null,
					expiresAt: null,
					attempt: null,
					leaseUntil: null,
					lastError: null,
				},
			});
		}
	}
	async function revokeInTransaction(
		tx: Pick<Adapter, "updateMany">,
		orderId: string,
	) {
		await tx.updateMany({
			model: "ecommerceDigitalGrant",
			where: [
				{ field: "orderId", value: orderId },
				{ field: "status", value: "revoked", operator: "ne" },
			],
			update: { status: "revoking", attempt: null, leaseUntil: null },
		});
	}
	async function run(orderId: string, grantId?: string) {
		let retryError: string | undefined;
		for (const record of await records(orderId)) {
			if (grantId && record.id !== grantId) continue;
			const current = await getOrder(adapter, orderId);
			if (!current) fail(404, "Order not found");
			const revoking =
				current.status === "cancelled" || current.paymentStatus === "refunded";
			if (
				!revoking &&
				(!current.paymentVerified || current.paymentStatus !== "paid")
			)
				continue;
			if (
				record.status === "revoked" ||
				(!revoking && record.status === "active")
			)
				continue;
			if (
				record.leaseUntil &&
				new Date(record.leaseUntil).getTime() > Date.now()
			)
				continue;
			const provider = config?.adapters[record.adapter];
			const attempt = crypto.randomUUID();
			const status = revoking ? "revoking" : "processing";
			const claimed = await adapter.update<DigitalGrantRecord>({
				model: "ecommerceDigitalGrant",
				where: [
					{ field: "id", value: record.id },
					{ field: "status", value: record.status },
					{ field: "attempt", value: record.attempt },
				],
				update: {
					status,
					attempt,
					leaseUntil: new Date(Date.now() + 300_000),
					lastError: null,
				},
			});
			if (!claimed) continue;
			const context: DigitalDeliveryContext = {
				grantId: record.id,
				orderId,
				resourceId: record.resourceId,
				quantity: record.quantity,
				customerId: current.customerId ?? null,
			};
			try {
				if (!provider) fail(503, "Digital delivery adapter is unavailable");
				if (revoking) await provider.revoke(context);
				else await provider.grant(context);
				const latest = await getOrder(adapter, orderId);
				const stillPaid =
					latest?.paymentVerified &&
					latest.paymentStatus === "paid" &&
					latest.status !== "cancelled";
				if (!revoking && !stillPaid) await provider.revoke(context);
				await adapter.update({
					model: "ecommerceDigitalGrant",
					where: [
						{ field: "id", value: record.id },
						{ field: "status", value: status },
						{ field: "attempt", value: attempt },
					],
					update: {
						status: revoking ? "revoked" : stillPaid ? "active" : "revoking",
						expiresAt:
							!revoking && record.expiresInSeconds
								? (record.expiresAt ??
									new Date(Date.now() + record.expiresInSeconds * 1000))
								: record.expiresAt,
						leaseUntil: null,
						attempt: null,
						lastError: null,
					},
				});
			} catch {
				await adapter.update({
					model: "ecommerceDigitalGrant",
					where: [
						{ field: "id", value: record.id },
						{ field: "status", value: status },
						{ field: "attempt", value: attempt },
					],
					update: {
						status: revoking ? "revoking" : "failed",
						leaseUntil: null,
						attempt: null,
						lastError: revoking
							? "Revocation failed; retry delivery"
							: "Delivery failed; retry delivery",
					},
				});
				retryError ??= revoking
					? "Digital revocation needs retry"
					: "Digital delivery needs retry";
			}
		}
		if (retryError) fail(503, retryError);
		return (await records(orderId)).map(safe);
	}
	async function authorize(
		orderId: string,
		identityId?: string,
		token?: string,
	) {
		const current = await getOrder(adapter, orderId);
		if (!current) fail(404, "Delivery not found");
		const owner = Boolean(
			current.customerId && current.customerId === identityId,
		);
		const guest =
			!current.customerId &&
			token &&
			current.deliveryGuestTokenHash &&
			current.deliveryGuestExpiresAt &&
			new Date(current.deliveryGuestExpiresAt).getTime() > Date.now() &&
			(await deliveryTokenHash(token)) === current.deliveryGuestTokenHash;
		if (!owner && !guest) fail(404, "Delivery not found");
		return current;
	}
	async function download(
		orderId: string,
		grantId: string,
		identityId?: string,
		token?: string,
	) {
		const current = await authorize(orderId, identityId, token);
		if (
			!current.paymentVerified ||
			current.paymentStatus !== "paid" ||
			current.status === "cancelled"
		)
			fail(403, "Delivery is not available");
		const record = (await records(orderId)).find(
			(grant) => grant.id === grantId,
		);
		if (!record) fail(404, "Delivery not found");
		if (
			record.status !== "active" ||
			(record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now())
		)
			fail(403, "Delivery is not available");
		const provider = config?.adapters[record.adapter];
		if (!provider?.download)
			fail(409, "This delivery has no protected download");
		const response = await provider.download({
			grantId,
			orderId,
			resourceId: record.resourceId,
			quantity: record.quantity,
			customerId: current.customerId ?? null,
		});
		// Check again after storage I/O so a concurrent refund cannot release a buffered response.
		const latest = await authorize(orderId, identityId, token);
		const latestGrant = (await records(orderId)).find(
			(grant) => grant.id === grantId,
		);
		if (
			latestGrant?.status !== "active" ||
			(latestGrant.expiresAt &&
				new Date(latestGrant.expiresAt).getTime() <= Date.now())
		)
			fail(403, "Delivery is not available");
		if (
			!latest?.paymentVerified ||
			latest.paymentStatus !== "paid" ||
			latest.status === "cancelled"
		)
			fail(403, "Delivery is not available");
		const headers = new Headers(response.headers);
		headers.set("cache-control", "private, no-store");
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	}
	return {
		order,
		snapshot,
		revokeInTransaction,
		run,
		authorize,
		download,
		records,
	};
}
