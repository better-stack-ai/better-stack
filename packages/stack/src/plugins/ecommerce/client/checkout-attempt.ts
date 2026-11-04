import type { Order } from "../types";

export interface CheckoutAttempt {
	fingerprint?: string;
	key?: string;
	orderId?: string;
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
	if (
		!attempt ||
		attempt.fingerprint !== fingerprint ||
		typeof attempt.key !== "string"
	)
		return undefined;
	if (attempt.orderId && isTerminalOrder(await verifyOrder(attempt.orderId)))
		return undefined;
	return attempt;
}
