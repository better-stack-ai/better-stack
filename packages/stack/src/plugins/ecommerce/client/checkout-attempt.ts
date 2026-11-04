import type { Order } from "../types";

export interface CheckoutAttempt {
	fingerprint?: string;
	key?: string;
	orderId?: string;
	uncertain?: boolean;
}

export function isTerminalOrder(
	order: Pick<Order, "status" | "paymentStatus">,
) {
	return order.paymentStatus !== "pending" || order.status === "cancelled";
}

/** Reuse ambiguous/pending attempts; only a verified terminal order permits a new payment. */
export async function reusableCheckoutAttempt(
	attempt: CheckoutAttempt | undefined,
	fingerprint: string,
	verifyOrder: (id: string) => Promise<Pick<Order, "status" | "paymentStatus">>,
): Promise<CheckoutAttempt | undefined> {
	if (!attempt || typeof attempt.key !== "string") return undefined;
	if (attempt.orderId && isTerminalOrder(await verifyOrder(attempt.orderId)))
		return undefined;
	if (attempt.fingerprint !== fingerprint) {
		throw new Error(
			"Your previous payment may still be active. Complete it, cancel it with the payment provider, or contact the shop to reconcile it before changing checkout details.",
		);
	}
	return attempt;
}

/** A later rejection cannot disprove an earlier request with an unknown outcome. */
export function canDiscardCheckoutAttempt(
	attempt: CheckoutAttempt | undefined,
	submittedKey: string,
	code: unknown,
) {
	return (
		code === "CHECKOUT_NOT_CREATED" &&
		attempt?.key === submittedKey &&
		!attempt.orderId &&
		!attempt.uncertain
	);
}
