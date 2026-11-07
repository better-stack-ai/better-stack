import { createHmac, timingSafeEqual } from "node:crypto";
import {
	protectedDownloadAdapter,
	type EcommerceBackendConfig,
	type PaymentAdapter,
} from "@btst/plugin-ecommerce/api";

// These credentials are fixtures for the generated E2E apps, never a live provider.
const DEMO_SECRET = "btst-ecommerce-e2e-only";
const refunds = new Map<
	string,
	{ paymentRef: string; amount: number; currency: string; refundRef: string }
>();

export const ecommerceDemoPaymentAdapter: PaymentAdapter = {
	async createPayment({ orderId }) {
		return { redirectUrl: `/pages/shop/orders/${orderId}/confirmation` };
	},
	refunds: {
		async createRefund(input) {
			const refundRef = `demo-refund-${input.orderId}`;
			refunds.set(input.idempotencyKey, {
				paymentRef: input.paymentRef,
				amount: input.amount,
				currency: input.currency,
				refundRef,
			});
			// This fixture can lose the response after the provider accepted a refund.
			if (input.paymentRef.startsWith("demo-uncertain-"))
				throw new Error("Demo provider response timed out");
			return { refundRef };
		},
		async getRefund(input) {
			const refund = refunds.get(input.idempotencyKey);
			return refund
				? { ...refund, status: "confirmed" as const }
				: {
						paymentRef: input.paymentRef,
						amount: input.amount,
						currency: input.currency,
						status: "uncertain" as const,
					};
		},
	},
	async handleWebhook(request) {
		const body = await request.text();
		const signature = request.headers.get("x-demo-signature") ?? "";
		const expected = createHmac("sha256", DEMO_SECRET)
			.update(body)
			.digest("hex");
		if (
			!/^[a-f0-9]{64}$/.test(signature) ||
			!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
		)
			throw new Error("Invalid demo payment signature");
		const event = JSON.parse(body);
		if (
			typeof event.orderId !== "string" ||
			!["paid", "refunded", "failed"].includes(event.status) ||
			typeof event.paymentRef !== "string" ||
			!Number.isSafeInteger(event.amount) ||
			typeof event.currency !== "string"
		)
			return null;
		return event;
	},
};

/** Private fixture bytes are served only through verified order grants. */
export const ecommerceDemoDigitalFulfillment: NonNullable<
	EcommerceBackendConfig["digitalFulfillment"]
> = {
	resolveItem: async ({ product }) =>
		product.slug.startsWith("digital-field-guide-")
			? { adapter: "downloads", resourceId: "field-guide-v1" }
			: null,
	adapters: {
		downloads: protectedDownloadAdapter({
			async read({ resourceId }) {
				if (resourceId !== "field-guide-v1")
					throw new Error("Unknown digital fixture resource");
				return {
					body: "BTST Field Guide\nPurchased digital delivery fixture.\n",
					filename: "field-guide.txt",
					contentType: "text/plain; charset=utf-8",
				};
			},
		}),
	},
};
