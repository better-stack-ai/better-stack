/** A verified provider event. Amount and currency must match the server's pending order. */
export interface PaymentWebhookResult {
	orderId: string;
	status: "paid" | "failed" | "refunded";
	paymentRef: string;
	amount: number;
	currency: string;
}
/** Payment providers verify signatures before returning an event. Calls may be retried with the same orderId. */
export interface PaymentAdapter {
	/** Provider name persisted alongside orders. */
	name?: string;
	/** Pure preflight before creating an order. Return a rejection message for unsupported totals; never create provider resources here. */
	validatePayment?(options: {
		amount: number;
		currency: string;
	}): string | undefined;
	/** Use orderId as the provider idempotency key. Return a hosted checkout URL or client secret. */
	createPayment(options: {
		amount: number;
		currency: string;
		orderId: string;
		metadata?: Record<string, string>;
	}): Promise<{ clientSecret?: string; redirectUrl?: string }>;
	/** Verify the raw request body and reject invalid signatures. Ignore unrelated event types with null. */
	handleWebhook(request: Request): Promise<PaymentWebhookResult | null>;
}
