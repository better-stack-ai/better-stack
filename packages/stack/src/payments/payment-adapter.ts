/** A provider checkout destination. At least one destination is required. */
export type PaymentCheckout = {
	clientSecret?: string;
	redirectUrl?: string;
};

/** A verified provider event. Amount and currency must match the server's pending order. */
export interface PaymentWebhookResult {
	orderId: string;
	status: "paid" | "failed" | "refunded";
	paymentRef: string;
	amount: number;
	currency: string;
}
/** Immutable full-order refund identity. Providers must never refund more than this payment's remaining amount. */
export interface PaymentRefundInput {
	orderId: string;
	paymentRef: string;
	amount: number;
	currency: string;
	idempotencyKey: string;
	refundRef?: string;
}
/** An authenticated provider lookup; confirmed means the full amount was successfully refunded. */
export interface PaymentRefundResult {
	status: "pending" | "confirmed" | "failed" | "uncertain";
	paymentRef: string;
	amount: number;
	currency: string;
	refundRef?: string;
}
/** Payment providers verify signatures before returning an event. Calls may be retried with the same orderId. */
export interface PaymentAdapter {
	/** Provider name persisted alongside orders. */
	name?: string;
	/** Optional full refunds. Creation is called at most once; recover timeouts through getRefund, never another creation. */
	refunds?: {
		createRefund(input: PaymentRefundInput): Promise<{ refundRef?: string }>;
		/** Look up the stable identity even when creation timed out before returning a refundRef. Missing/ambiguous results must be uncertain. */
		getRefund(input: PaymentRefundInput): Promise<PaymentRefundResult>;
	};
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
	}): Promise<PaymentCheckout>;
	/** Verify the raw request body and reject invalid signatures. Ignore unrelated event types with null. */
	handleWebhook(request: Request): Promise<PaymentWebhookResult | null>;
}
