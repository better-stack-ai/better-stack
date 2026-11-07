import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import {
	ecommerceBackendPlugin,
	PRODUCT_CONTENT_TYPE,
	protectedDownloadAdapter,
} from "../api";
import type { EcommerceBackendConfig } from "../api/operations";
import type { DigitalFulfillmentAdapter } from "../api/digital-fulfillment";
import type {
	PaymentAdapter,
	PaymentRefundInput,
} from "../api/payment-adapter";
import { ecommercePermissions } from "../permissions";
import type { CheckoutInput, Product } from "../types";
function serializedMemory(db: DatabaseDefinition): DBAdapter {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function lock<T>(run: () => Promise<T>): Promise<T> {
		const previous = tail;
		let release = () => {};
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	}
	return {
		...adapter,
		id: "serialized-test-memory",
		create: ((input) =>
			lock(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			lock(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			lock(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => lock(() => adapter.count(input)),
		update: ((input) =>
			lock(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => lock(() => adapter.updateMany(input)),
		delete: ((input) =>
			lock(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => lock(() => adapter.deleteMany(input)),
		transaction: ((callback) =>
			lock(() => adapter.transaction(callback))) as DBAdapter["transaction"],
	};
}
const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string() }),
	permissions: [cmsPermissions, ecommercePermissions],
	rules: ({ ecommerce, cms }) => [
		cms.contentType.read.when(({ identity }) => identity?.role === "admin"),
		cms.record.update.when(({ identity }) => identity?.role === "admin"),
		ecommerce.product.read.allow(),
		ecommerce.checkout.create.allow(),
		ecommerce.discount.validate.allow(),
		ecommerce.order.confirmation.allow(),
		ecommerce.product.manage.when(({ identity }) => identity?.role === "admin"),
		ecommerce.discount.manage.when(
			({ identity }) => identity?.role === "admin",
		),
		ecommerce.order.read.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.update.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.own.when(({ identity }) => identity !== null),
	],
});
const demoAdapter: PaymentAdapter = {
	name: "demo",
	createPayment: vi.fn(async () => ({
		redirectUrl: "https://payments.example/checkout",
	})),
	handleWebhook: async (request) => {
		if (request.headers.get("x-demo-secret") !== "test-secret")
			throw new Error("Invalid signature");
		return request.json();
	},
};
async function setup(
	config: Partial<EcommerceBackendConfig> = {},
	atomic = true,
) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => {
			adapter = atomic ? serializedMemory(db) : createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id, role: id === "admin" ? "admin" : "user" } : null;
			},
		}),
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [PRODUCT_CONTENT_TYPE] }),
			ecommerce: ecommerceBackendPlugin({
				paymentAdapter: {
					...demoAdapter,
					createPayment: vi.fn(async () => ({
						redirectUrl: "https://payments.example/checkout",
					})),
				},
				...config,
			}),
		},
	});
	return { stack, adapter, ops: stack.trusted.ecommerce };
}
function req(
	path: string,
	method = "GET",
	body?: unknown,
	user?: string,
	headers: Record<string, string> = {},
) {
	return new Request(`https://test.local/api/shop/${path}`, {
		method,
		headers: {
			"content-type": "application/json",
			...(user ? { "x-user": user } : {}),
			...headers,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}
const address = {
	name: "Alex Buyer",
	line1: "12 Pine St",
	city: "Boston",
	region: "MA",
	postalCode: "02108",
	country: "US",
};
function checkout(
	product: Pick<Product, "id">,
	extra: Partial<CheckoutInput> = {},
): CheckoutInput {
	return {
		items: [{ productId: product.id, quantity: 1 }],
		email: "buyer@example.com",
		shippingAddress: address,
		idempotencyKey: crypto.randomUUID(),
		...extra,
	};
}
async function product(
	ops: Awaited<ReturnType<typeof setup>>["ops"],
	data = {},
) {
	return ops.createProduct({
		slug: `notebook-${crypto.randomUUID()}`,
		data: {
			name: "Field notebook",
			price: 1800,
			stock: 10,
			status: "published",
			category: "Stationery",
			...data,
		},
	});
}

function digital(provider?: DigitalFulfillmentAdapter) {
	return {
		resolveItem: vi.fn(async () => ({
			adapter: "downloads",
			resourceId: "private-original",
			expiresInSeconds: 3600,
		})),
		adapters: {
			downloads:
				provider ??
				protectedDownloadAdapter({
					read: async ({ resourceId }) => ({
						body: resourceId,
						filename: "guide.txt",
					}),
				}),
		},
	};
}
async function event(
	stack: Awaited<ReturnType<typeof setup>>["stack"],
	orderId: string,
	status = "paid",
) {
	return stack.handler(
		req(
			"webhook",
			"POST",
			{ orderId, status, paymentRef: "pay-1", amount: 1800, currency: "USD" },
			undefined,
			{ "x-demo-secret": "test-secret" },
		),
	);
}
afterEach(() => vi.useRealTimers());
describe("verified digital fulfillment", () => {
	it("uses one stored purchased snapshot under concurrent paid events; browser flags and edited CMS cannot deliver", async () => {
		const grant = vi.fn(async () => {});
		const settings = digital({ grant, revoke: async () => {} });
		const { stack, ops, adapter } = await setup({
			digitalFulfillment: settings,
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		const pending = await ops.getOrder({ id: purchased.orderId });
		expect(pending.deliveryGrants?.[0]?.status).toBe("pending");
		await ops.retryOrderDelivery({
			id: purchased.orderId,
			grantId: pending.deliveryGrants![0]!.id,
		});
		expect(grant).not.toHaveBeenCalled();
		await adapter.update({
			model: "contentItem",
			where: [{ field: "id", value: item.id }],
			update: { data: JSON.stringify({ ...item, name: "Changed", stock: 5 }) },
		});
		settings.resolveItem.mockResolvedValue({
			adapter: "downloads",
			resourceId: "changed-after-checkout",
			expiresInSeconds: 3600,
		});
		const responses = await Promise.all([
			event(stack, purchased.orderId),
			event(stack, purchased.orderId),
		]);
		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		expect(grant).toHaveBeenCalledTimes(1);
		expect(grant.mock.calls[0]?.[0]).toMatchObject({
			resourceId: "private-original",
		});
		const order = await ops.getOrder({ id: purchased.orderId });
		expect(order.deliveryGrants).toHaveLength(1);
		expect(order.deliveryGrants?.[0]).toMatchObject({
			name: "Field notebook",
			status: "active",
			quantity: 1,
		});
		expect(JSON.stringify(order)).not.toContain("private-original");
	});
	it("denies unsigned payment and cross-customer access while streaming to the verified purchaser", async () => {
		const { stack, ops } = await setup({ digitalFulfillment: digital() });
		const item = await product(ops);
		const purchased = await (
			await stack.handler(req("checkout", "POST", checkout(item), "buyer"))
		).json();
		const orderId = purchased.orderId as string;
		const grantId = (await ops.getOrder({ id: orderId })).deliveryGrants![0]!
			.id;
		expect(
			(await stack.handler(req("webhook", "POST", { orderId, status: "paid" })))
				.status,
		).toBe(400);
		expect(
			(
				await stack.handler(
					req(
						`orders/${orderId}/deliveries/${grantId}/download`,
						"POST",
						{},
						"buyer",
					),
				)
			).status,
		).toBe(403);
		await event(stack, orderId);
		expect(
			(
				await stack.handler(
					req(
						`orders/${orderId}/deliveries/${grantId}/download`,
						"POST",
						{},
						"other",
					),
				)
			).status,
		).toBe(404);
		expect(
			(
				await stack.handler(
					req(`orders/${orderId}/deliveries/${grantId}/download`, "POST", {
						token: purchased.accessToken,
					}),
				)
			).status,
		).toBe(404);
		const response = await stack.handler(
			req(
				`orders/${orderId}/deliveries/${grantId}/download`,
				"POST",
				{},
				"buyer",
			),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("private-original");
		expect(response.headers.get("cache-control")).toBe("private, no-store");
	});
	it("rechecks guest capability expiry after private storage returns", async () => {
		let finishRead!: () => void;
		let reading!: () => void;
		const started = new Promise<void>((resolve) => {
			reading = resolve;
		});
		const blocked = new Promise<void>((resolve) => {
			finishRead = resolve;
		});
		const { stack, ops } = await setup({
			digitalFulfillment: digital(
				protectedDownloadAdapter({
					read: async () => {
						reading();
						await blocked;
						return { body: "private", filename: "guide.txt" };
					},
				}),
			),
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		await event(stack, purchased.orderId);
		const guest = await ops.issueGuestDeliveryToken({
			id: purchased.orderId,
			expiresInSeconds: 1,
		});
		const grantId = (await ops.getOrder({ id: purchased.orderId }))
			.deliveryGrants![0]!.id;
		const response = stack.handler(
			req(
				`orders/${purchased.orderId}/deliveries/${grantId}/download`,
				"POST",
				{ token: guest.token },
			),
		);
		await started;
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 2000);
		finishRead();
		expect((await response).status).toBe(404);
	});
	it("preserves physical orders and revokes one quantity-aware grant on administrator cancellation", async () => {
		const physical = await setup();
		const physicalProduct = await product(physical.ops);
		const physicalOrder = await physical.ops.createCheckout(
			checkout(physicalProduct),
		);
		await event(physical.stack, physicalOrder.orderId);
		expect(
			(await physical.ops.getOrder({ id: physicalOrder.orderId }))
				.deliveryGrants,
		).toBeUndefined();
		const grant = vi.fn(async () => {});
		const revoke = vi.fn(async () => {});
		const { stack, ops } = await setup({
			digitalFulfillment: digital({ grant, revoke }),
		});
		const item = await product(ops, { price: 900 });
		const purchased = await ops.createCheckout(
			checkout(item, { items: [{ productId: item.id, quantity: 2 }] }),
		);
		await event(stack, purchased.orderId);
		expect(grant).toHaveBeenCalledOnce();
		expect(grant.mock.calls[0]?.[0]).toMatchObject({ quantity: 2 });
		await ops.updateOrderStatus({ id: purchased.orderId, status: "cancelled" });
		await ops.updateOrderStatus({ id: purchased.orderId, status: "cancelled" });
		expect(revoke).toHaveBeenCalledOnce();
		const order = await ops.getOrder({ id: purchased.orderId });
		expect(order.paymentStatus).toBe("paid");
		expect(order.deliveryGrants![0]!.status).toBe("revoked");
	});

	it("recovers failed and interrupted attempts with the same grant identity and sanitizes errors", async () => {
		const grant = vi
			.fn()
			.mockRejectedValueOnce(new Error("secret=private-storage-key"))
			.mockResolvedValue(undefined);
		const { stack, ops, adapter } = await setup({
			digitalFulfillment: digital({ grant, revoke: async () => {} }),
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		expect((await event(stack, purchased.orderId)).status).toBe(503);
		const failed = (await ops.getOrder({ id: purchased.orderId }))
			.deliveryGrants![0]!;
		expect(failed.status).toBe("failed");
		expect(failed.lastError).not.toContain("secret");
		// Simulate a worker dying after its durable claim and before recording adapter completion.
		await adapter.update({
			model: "ecommerceDigitalGrant",
			where: [{ field: "id", value: failed.id }],
			update: {
				status: "processing",
				attempt: "crashed-worker",
				leaseUntil: new Date(Date.now() - 1),
			},
		});
		await ops.retryOrderDelivery({ id: purchased.orderId, grantId: failed.id });
		expect(
			(await ops.getOrder({ id: purchased.orderId })).deliveryGrants![0]!
				.status,
		).toBe("active");
		expect(grant.mock.calls.map(([context]) => context.grantId)).toEqual([
			failed.id,
			failed.id,
		]);
	});
	it("requires an expiring guest capability, rotates it, and permanently binds an explicit claim to identity", async () => {
		const { stack, ops } = await setup({ digitalFulfillment: digital() });
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		await event(stack, purchased.orderId);
		const grantId = (await ops.getOrder({ id: purchased.orderId }))
			.deliveryGrants![0]!.id;
		const download = (token: string, user?: string) =>
			stack.handler(
				req(
					`orders/${purchased.orderId}/deliveries/${grantId}/download`,
					"POST",
					{ token },
					user,
				),
			);
		expect((await download(purchased.accessToken)).status).toBe(404);
		const old = await ops.issueGuestDeliveryToken({
			id: purchased.orderId,
			expiresInSeconds: 1,
		});
		expect((await download(old.token)).status).toBe(200);
		vi.useFakeTimers();
		vi.setSystemTime(Date.now() + 2000);
		expect((await download(old.token)).status).toBe(404);
		vi.useRealTimers();
		const current = await ops.issueGuestDeliveryToken({
			id: purchased.orderId,
			expiresInSeconds: 3600,
		});
		expect((await download(old.token)).status).toBe(404);
		expect(
			(
				await stack.handler(
					req(`orders/${purchased.orderId}/deliveries/claim`, "POST", {
						token: current.token,
					}),
				)
			).status,
		).toBe(401);
		expect(
			(
				await stack.handler(
					req(
						`orders/${purchased.orderId}/deliveries/claim`,
						"POST",
						{ token: current.token },
						"claimant",
					),
				)
			).status,
		).toBe(200);
		expect((await download(current.token)).status).toBe(404);
		expect((await download("", "claimant")).status).toBe(200);
	});
	it("reconciles administrator refunds and retries failed digital revocation without repeating money or grant effects", async () => {
		let complete!: () => void;
		let started!: () => void;
		const retryStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const retryBlocked = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const grant = vi.fn(async () => {});
		const revoke = vi
			.fn()
			.mockRejectedValueOnce(new Error("revocation provider unavailable"))
			.mockImplementation(async () => {
				started();
				await retryBlocked;
			});
		const createRefund = vi.fn(async () => ({ refundRef: "refund-1" }));
		const getRefund = vi
			.fn(async (input: PaymentRefundInput) => ({
				...input,
				status: "confirmed" as const,
			}))
			.mockRejectedValueOnce(new Error("payment provider timeout"));
		const { stack, ops } = await setup({
			paymentAdapter: { ...demoAdapter, refunds: { createRefund, getRefund } },
			digitalFulfillment: digital({
				grant,
				revoke,
				download: async () => new Response("private"),
			}),
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		const id = purchased.orderId;
		expect((await event(stack, id)).status).toBe(200);
		const capability = await ops.issueGuestDeliveryToken({ id });
		const grantId = (await ops.getOrder({ id })).deliveryGrants![0]!.id;
		const download = () =>
			stack.handler(
				req(`orders/${id}/deliveries/${grantId}/download`, "POST", {
					token: capability.token,
				}),
			);
		expect((await ops.refundOrder({ id, confirm: true })).attempt?.status).toBe(
			"pending",
		);
		expect((await ops.reconcileOrderRefund({ id })).attempt?.status).toBe(
			"uncertain",
		);
		expect(revoke).not.toHaveBeenCalled();
		expect((await download()).status).toBe(200);
		await expect(ops.reconcileOrderRefund({ id })).rejects.toThrow(
			"Digital revocation needs retry",
		);
		expect((await ops.getOrderRefund({ id })).attempt?.status).toBe(
			"confirmed",
		);
		expect((await ops.getOrder({ id })).deliveryGrants![0]!.status).toBe(
			"revoking",
		);
		expect((await download()).status).toBe(403);
		const recovering = ops.reconcileOrderRefund({ id });
		await retryStarted;
		try {
			expect((await event(stack, id, "refunded")).status).toBe(200);
			expect(revoke).toHaveBeenCalledTimes(2);
			expect((await download()).status).toBe(403);
		} finally {
			complete();
		}
		await recovering;
		await ops.reconcileOrderRefund({ id });
		expect((await event(stack, id, "paid")).status).toBe(200);
		expect((await event(stack, id, "refunded")).status).toBe(200);
		expect(await ops.getOrder({ id })).toMatchObject({
			status: "paid",
			paymentStatus: "refunded",
			deliveryGrants: [{ id: grantId, status: "revoked" }],
		});
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
		expect(createRefund).toHaveBeenCalledTimes(1);
		expect(getRefund).toHaveBeenCalledTimes(2);
		expect(grant).toHaveBeenCalledTimes(1);
		expect(revoke).toHaveBeenCalledTimes(2);
	});
	it("keeps financial history and retries failed revocation without restoring download access", async () => {
		const revoke = vi
			.fn()
			.mockRejectedValueOnce(new Error("temporary"))
			.mockResolvedValue(undefined);
		const { stack, ops } = await setup({
			digitalFulfillment: digital({
				grant: async () => {},
				revoke,
				download: async () => new Response("private"),
			}),
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		await event(stack, purchased.orderId);
		const capability = await ops.issueGuestDeliveryToken({
			id: purchased.orderId,
		});
		expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
			503,
		);
		const order = await ops.getOrder({ id: purchased.orderId });
		expect(order.paymentStatus).toBe("refunded");
		expect(order.total).toBe(1800);
		expect(order.deliveryGrants![0]!.status).toBe("revoking");
		const grantId = order.deliveryGrants![0]!.id;
		expect(
			(
				await stack.handler(
					req(`orders/${order.id}/deliveries/${grantId}/download`, "POST", {
						token: capability.token,
					}),
				)
			).status,
		).toBe(403);
		expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
			200,
		);
		expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
			200,
		);
		expect(revoke).toHaveBeenCalledTimes(2);
		expect(
			(await ops.getOrder({ id: order.id })).deliveryGrants![0]!.status,
		).toBe("revoked");
	});
	it.each(["throws", "is unavailable"] as const)(
		"revokes healthy items when another provider %s and retries only the failed revocation",
		async (failure) => {
			const firstGrant = vi.fn(async () => {});
			const secondGrant = vi.fn(async () => {});
			const firstRevoke = vi.fn().mockResolvedValue(undefined);
			if (failure === "throws")
				firstRevoke.mockRejectedValueOnce(new Error("temporary"));
			const secondRevoke = vi.fn(async () => {});
			const providers: Record<string, DigitalFulfillmentAdapter> = {
				first: { grant: firstGrant, revoke: firstRevoke },
				second: { grant: secondGrant, revoke: secondRevoke },
			};
			const { stack, ops } = await setup({
				digitalFulfillment: {
					resolveItem: ({ lineItem }) => ({
						adapter: lineItem.name,
						resourceId: lineItem.productId,
					}),
					adapters: providers,
				},
			});
			const first = await product(ops, { name: "first", price: 900 });
			const second = await product(ops, { name: "second", price: 900 });
			const purchased = await ops.createCheckout(
				checkout(first, {
					items: [
						{ productId: first.id, quantity: 1 },
						{ productId: second.id, quantity: 1 },
					],
				}),
			);
			expect((await event(stack, purchased.orderId)).status).toBe(200);
			const grants = (await ops.getOrder({ id: purchased.orderId }))
				.deliveryGrants!;
			if (failure === "is unavailable")
				Reflect.deleteProperty(providers, "first");
			expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
				503,
			);
			expect(secondRevoke).toHaveBeenCalledOnce();
			expect(
				(await ops.getOrder({ id: purchased.orderId })).deliveryGrants!.map(
					(grant) => grant.status,
				),
			).toEqual(["revoking", "revoked"]);
			providers.first = { grant: firstGrant, revoke: firstRevoke };
			expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
				200,
			);
			expect(
				firstRevoke.mock.calls.map(([context]) => context.grantId),
			).toEqual(
				failure === "throws" ? [grants[0]!.id, grants[0]!.id] : [grants[0]!.id],
			);
			expect(secondRevoke).toHaveBeenCalledOnce();
			expect(firstGrant).toHaveBeenCalledOnce();
			expect(secondGrant).toHaveBeenCalledOnce();
			expect(
				(await ops.getOrder({ id: purchased.orderId })).deliveryGrants!.map(
					(grant) => grant.status,
				),
			).toEqual(["revoked", "revoked"]);
		},
	);

	it("revokes a late grant after a concurrent refund and never restores active status", async () => {
		let complete!: () => void;
		let started!: () => void;
		const startedGrant = new Promise<void>((resolve) => {
			started = resolve;
		});
		const heldGrant = new Promise<void>((resolve) => {
			complete = resolve;
		});
		const effects: string[] = [];
		const { stack, ops } = await setup({
			digitalFulfillment: digital({
				grant: async () => {
					started();
					await heldGrant;
					effects.push("grant");
				},
				revoke: async () => {
					effects.push("revoke");
				},
			}),
		});
		const item = await product(ops);
		const purchased = await ops.createCheckout(checkout(item));
		const paid = event(stack, purchased.orderId);
		await startedGrant;
		expect((await event(stack, purchased.orderId, "refunded")).status).toBe(
			200,
		);
		complete();
		expect((await paid).status).toBe(200);
		expect(effects.at(-1)).toBe("revoke");
		expect(
			(await ops.getOrder({ id: purchased.orderId })).deliveryGrants![0]!
				.status,
		).toBe("revoked");
	});
});
