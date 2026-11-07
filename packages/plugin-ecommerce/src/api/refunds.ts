import type { DBAdapter as Adapter } from "@btst/db";
import { z } from "zod";
import type {
	OrderRecord,
	OrderRefund,
	RefundAttempt,
	RefundRecord,
} from "../types";
import type {
	PaymentAdapter,
	PaymentRefundInput,
	PaymentRefundResult,
} from "./payment-adapter";
import { getOrder, getRefund } from "./getters";
import { ecommerceError as fail, requireAtomicTransactions } from "./mutations";

function serializeRefund(record: RefundRecord): RefundAttempt {
	return {
		id: record.id,
		orderId: record.orderId,
		status: record.status,
		amount: record.amount,
		currency: record.currency,
		refundRef: record.refundRef,
		history: JSON.parse(record.history),
		createdAt: new Date(record.createdAt).toISOString(),
		updatedAt: new Date(record.updatedAt).toISOString(),
	};
}
function refundData(order: OrderRecord, status: RefundAttempt["status"]) {
	const now = new Date();
	return {
		orderId: order.id,
		idempotencyKey: `btst-full-refund:${order.id}`,
		paymentRef: order.paymentRef!,
		paymentProvider: order.paymentProvider,
		amount: order.total,
		currency: order.currency,
		status,
		history: JSON.stringify([{ status, createdAt: now.toISOString() }]),
		createdAt: now,
		updatedAt: now,
	};
}
/** Lower-level refund transition within the caller's transaction; confirmed outcomes never regress. */
export async function transitionRefund(
	adapter: Pick<Adapter, "update">,
	record: RefundRecord,
	status: RefundAttempt["status"],
	refundRef?: string,
) {
	if (record.status === "confirmed" || (record.status === status && !refundRef))
		return record;
	const now = new Date(
		Math.max(Date.now(), new Date(record.updatedAt).getTime() + 1),
	);
	const updated = await adapter.update<RefundRecord>({
		model: "ecommerceRefund",
		where: [
			{ field: "id", value: record.id },
			{ field: "updatedAt", value: record.updatedAt },
		],
		update: {
			status,
			...(refundRef ? { refundRef } : {}),
			history:
				status === record.status
					? record.history
					: JSON.stringify([
							...JSON.parse(record.history),
							{ status, createdAt: now.toISOString() },
						]),
			updatedAt: now,
		},
	});
	return updated ?? fail(409, "Refund changed; reload and reconcile");
}
/** Called only for an authenticated, amount-matched full refund in an isolated transaction. */
export async function confirmOrderRefund(
	adapter: Pick<Adapter, "findOne" | "create" | "update">,
	order: OrderRecord,
	refundRef?: string,
) {
	const record = await getRefund(adapter, order.id);
	if (record) await transitionRefund(adapter, record, "confirmed", refundRef);
	else
		await adapter.create<RefundRecord>({
			model: "ecommerceRefund",
			data: {
				...refundData(order, "confirmed"),
				...(refundRef ? { refundRef } : {}),
			},
		});
	if (order.paymentStatus !== "refunded") {
		const updated = await adapter.update({
			model: "ecommerceOrder",
			where: [
				{ field: "id", value: order.id },
				{ field: "updatedAt", value: order.updatedAt },
			],
			update: {
				paymentStatus: "refunded",
				paymentRef: order.paymentRef,
				updatedAt: new Date(
					Math.max(Date.now(), new Date(order.updatedAt).getTime() + 1),
				),
			},
		});
		if (!updated) fail(409, "Order changed; retry refund reconciliation");
	}
}
function providerInput(record: RefundRecord): PaymentRefundInput {
	return {
		orderId: record.orderId,
		paymentRef: record.paymentRef,
		amount: record.amount,
		currency: record.currency,
		idempotencyKey: record.idempotencyKey,
		...(record.refundRef ? { refundRef: record.refundRef } : {}),
	};
}

/** Refund execution helpers; the operation inventory owns authorization and input validation. */
export function orderRefunds(adapter: Adapter, payment: PaymentAdapter) {
	async function overview(id: string): Promise<OrderRefund> {
		const order = (await getOrder(adapter, id)) ?? fail(404, "Order not found");
		const attempt = await getRefund(adapter, id);
		const unavailableReason = !payment.refunds
			? "This payment provider does not support administrator refunds"
			: order.paymentProvider !== (payment.name ?? "custom")
				? "The order's payment provider is unavailable"
				: attempt
					? attempt.status === "confirmed"
						? "This order has already been fully refunded"
						: "A full refund has already been initiated; reconcile its outcome"
					: order.paymentStatus !== "paid" ||
							!order.paymentRef ||
							!Number.isSafeInteger(order.total) ||
							order.total <= 0
						? "Only a paid order with a positive verified payment can be refunded"
						: undefined;
		return {
			supported: Boolean(payment.refunds),
			eligible: !unavailableReason,
			...(unavailableReason ? { unavailableReason } : {}),
			amount: order.total,
			currency: order.currency,
			attempt: attempt ? serializeRefund(attempt) : null,
		};
	}
	async function initiate(id: string) {
		requireAtomicTransactions(adapter);
		const view = await overview(id);
		if (view.attempt) return view;
		if (!view.eligible) fail(409, view.unavailableReason!);
		let record: RefundRecord;
		try {
			const claim = await adapter.transaction(async (tx) => {
				const existing = await getRefund(tx, id);
				if (existing) return { record: existing, created: false };
				const order = (await getOrder(tx, id)) ?? fail(404, "Order not found");
				if (order.paymentStatus !== "paid" || !order.paymentRef)
					fail(409, "Order is no longer eligible for a refund");
				const record = await tx.create<RefundRecord>({
					model: "ecommerceRefund",
					data: refundData(order, "pending"),
				});
				return { record, created: true };
			});
			if (!claim.created) return overview(id);
			record = claim.record;
		} catch (error) {
			// A unique order identity lets only the creator contact the provider.
			if (await getRefund(adapter, id)) return overview(id);
			throw error;
		}
		try {
			const result = z
				.object({ refundRef: z.string().min(1).optional() })
				.parse(await payment.refunds!.createRefund(providerInput(record)));
			await adapter.transaction(async (tx) => {
				const latest = (await getRefund(tx, id))!;
				if (latest.status === "pending")
					await transitionRefund(tx, latest, "pending", result.refundRef);
			});
		} catch {
			await adapter.transaction(async (tx) => {
				const latest = (await getRefund(tx, id))!;
				if (latest.status === "pending")
					await transitionRefund(tx, latest, "uncertain");
			});
		}
		return overview(id);
	}
	async function reconcile(id: string) {
		requireAtomicTransactions(adapter);
		const record =
			(await getRefund(adapter, id)) ??
			fail(409, "No refund has been initiated");
		if (record.status === "confirmed") return overview(id);
		if (
			!payment.refunds ||
			record.paymentProvider !== (payment.name ?? "custom")
		)
			fail(409, "The refund provider is unavailable");
		let result: PaymentRefundResult;
		try {
			result = z
				.object({
					status: z.enum(["pending", "confirmed", "failed", "uncertain"]),
					paymentRef: z.string().min(1),
					amount: z.number().int().positive(),
					currency: z.string().regex(/^[A-Za-z]{3}$/),
					refundRef: z.string().min(1).optional(),
				})
				.parse(await payment.refunds.getRefund(providerInput(record)));
		} catch {
			result = {
				status: "uncertain" as const,
				paymentRef: record.paymentRef,
				amount: record.amount,
				currency: record.currency,
			};
		}
		if (
			result.paymentRef !== record.paymentRef ||
			result.amount !== record.amount ||
			result.currency.toUpperCase() !== record.currency.toUpperCase() ||
			(record.refundRef &&
				result.refundRef &&
				record.refundRef !== result.refundRef)
		)
			fail(400, "Refund does not match the order payment");
		await adapter.transaction(async (tx) => {
			const latest = (await getRefund(tx, id))!;
			const order = (await getOrder(tx, id)) ?? fail(404, "Order not found");
			if (
				order.total !== latest.amount ||
				order.currency !== latest.currency ||
				order.paymentRef !== latest.paymentRef ||
				order.paymentProvider !== latest.paymentProvider
			)
				fail(400, "Refund does not match the order payment");
			if (latest.status === "confirmed") return;
			// Ignore a lookup started before a newer transition; repeat reconciliation instead.
			if (
				new Date(latest.updatedAt).getTime() !==
				new Date(record.updatedAt).getTime()
			)
				return;
			if (result.status === "confirmed")
				await confirmOrderRefund(tx, order, result.refundRef);
			else await transitionRefund(tx, latest, result.status, result.refundRef);
		});
		return overview(id);
	}
	return { overview, initiate, reconcile };
}
