import { z } from "zod";
import type { PaymentAdapter, PaymentWebhookResult } from "../payment-adapter";
import { verifyHmac } from "./signatures";

/** Optional hosted Checkout destinations; without these, Stripe returns a PaymentIntent client secret. */
export interface StripeAdapterOptions {
	/** Absolute success URL. Include your storefront confirmation route; its token remains in sessionStorage. */
	successUrl?: string;
	/** Absolute URL used when the buyer cancels hosted Checkout. */
	cancelUrl?: string;
}
/** Stripe REST integration with signed raw-body webhooks and provider-side checkout idempotency. */
export function stripeAdapter(
	secretKey: string,
	webhookSecret: string,
	options: StripeAdapterOptions = {},
): PaymentAdapter {
	if (!secretKey || !webhookSecret)
		throw new Error("Stripe secret key and webhook secret are required");
	if (Boolean(options.successUrl) !== Boolean(options.cancelUrl))
		throw new Error("Configure both Stripe successUrl and cancelUrl");
	for (const url of [options.successUrl, options.cancelUrl])
		if (url && !/^https?:\/\//.test(z.url().parse(url)))
			throw new Error("Stripe destinations must use HTTP(S)");
	return {
		name: "stripe",
		async createPayment({ amount, currency, orderId, metadata }) {
			const hosted = Boolean(options.successUrl);
			const body = new URLSearchParams();
			if (hosted) {
				body.set("mode", "payment");
				body.set(
					"success_url",
					options.successUrl!.replace("{orderId}", encodeURIComponent(orderId)),
				);
				body.set("cancel_url", options.cancelUrl!);
				body.set("line_items[0][price_data][currency]", currency.toLowerCase());
				body.set("line_items[0][price_data][unit_amount]", String(amount));
				body.set(
					"line_items[0][price_data][product_data][name]",
					`Order ${orderId}`,
				);
				body.set("line_items[0][quantity]", "1");
				body.set("payment_intent_data[metadata][orderId]", orderId);
				if (metadata?.email) body.set("customer_email", metadata.email);
			} else {
				body.set("amount", String(amount));
				body.set("currency", currency.toLowerCase());
				body.set("automatic_payment_methods[enabled]", "true");
			}
			body.set("metadata[orderId]", orderId);
			const response = await fetch(
				`https://api.stripe.com/v1/${hosted ? "checkout/sessions" : "payment_intents"}`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${secretKey}`,
						"content-type": "application/x-www-form-urlencoded",
						"idempotency-key": orderId,
					},
					body,
				},
			);
			if (!response.ok) throw new Error("Stripe payment initialization failed");
			const result = z
				.object({
					client_secret: z.string().nullable().optional(),
					url: z.url().nullable().optional(),
				})
				.parse(await response.json());
			if (hosted && result.url) return { redirectUrl: result.url };
			if (!hosted && result.client_secret)
				return { clientSecret: result.client_secret };
			throw new Error("Stripe returned no checkout destination");
		},
		async handleWebhook(request): Promise<PaymentWebhookResult | null> {
			const raw = await request.text();
			const header = request.headers.get("stripe-signature") ?? "";
			const parts = header.split(",").map((value) => value.trim().split("="));
			const timestamp = parts.find(([key]) => key === "t")?.[1] ?? "";
			if (
				!/^\d+$/.test(timestamp) ||
				Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
			)
				throw new Error("Invalid Stripe webhook timestamp");
			const signatures = parts
				.filter(([key]) => key === "v1")
				.map(([, value]) => value ?? "");
			let verified = false;
			for (const signature of signatures)
				if (await verifyHmac(webhookSecret, `${timestamp}.${raw}`, signature))
					verified = true;
			if (!verified) throw new Error("Invalid Stripe webhook signature");
			const event = z
				.object({
					type: z.string(),
					livemode: z.boolean().optional(),
					data: z.object({ object: z.record(z.string(), z.unknown()) }),
				})
				.parse(JSON.parse(raw));
			if (
				event.livemode !== undefined &&
				((secretKey.startsWith("sk_live_") && !event.livemode) ||
					(secretKey.startsWith("sk_test_") && event.livemode))
			)
				throw new Error("Stripe event mode mismatch");
			const object = event.data.object;
			const metadata = z
				.object({ orderId: z.string().min(1) })
				.safeParse(object.metadata);
			if (!metadata.success) return null;
			let status: PaymentWebhookResult["status"];
			let amount: unknown;
			if (event.type === "payment_intent.succeeded") {
				status = "paid";
				amount = object.amount_received;
			} else if (event.type === "payment_intent.canceled") {
				status = "failed";
				amount = object.amount;
			} else if (
				event.type === "checkout.session.completed" ||
				event.type === "checkout.session.async_payment_succeeded"
			) {
				if (
					object.payment_status !== "paid" &&
					!(
						object.payment_status === "no_payment_required" &&
						object.amount_total === 0
					)
				)
					return null;
				status = "paid";
				amount = object.amount_total;
			} else if (
				event.type === "checkout.session.expired" ||
				event.type === "checkout.session.async_payment_failed"
			) {
				status = "failed";
				amount = object.amount_total;
			} else if (
				event.type === "charge.refunded" &&
				object.refunded === true &&
				object.amount_refunded === object.amount
			) {
				status = "refunded";
				amount = object.amount;
			} else return null;
			return {
				orderId: metadata.data.orderId,
				status,
				paymentRef: z
					.string()
					.min(1)
					.parse(object.payment_intent ?? object.id),
				amount: z.number().int().min(0).parse(amount),
				currency: z.string().parse(object.currency),
			};
		},
	};
}
