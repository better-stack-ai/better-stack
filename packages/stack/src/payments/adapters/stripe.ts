import { z } from "zod";
import type {
	PaymentAdapter,
	PaymentWebhookResult,
	PaymentRefundInput,
	PaymentRefundResult,
} from "../payment-adapter";
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
	const refundSchema = z.object({
		id: z.string().min(1),
		payment_intent: z.string().min(1),
		amount: z.number().int().nonnegative(),
		currency: z.string(),
		status: z.string(),
		metadata: z.record(z.string(), z.string()).optional(),
	});
	async function stripeRequest(path: string, init?: RequestInit) {
		const response = await fetch(`https://api.stripe.com/v1/${path}`, {
			...init,
			headers: { authorization: `Bearer ${secretKey}`, ...init?.headers },
		});
		if (!response.ok) throw new Error("Stripe refund request failed");
		return response.json();
	}
	async function listRefunds(paymentRef: string) {
		const refunds: z.output<typeof refundSchema>[] = [];
		let cursor: string | undefined;
		for (;;) {
			const query = new URLSearchParams({
				payment_intent: paymentRef,
				limit: "100",
			});
			if (cursor) query.set("starting_after", cursor);
			const page = z
				.object({ data: z.array(refundSchema), has_more: z.boolean() })
				.parse(await stripeRequest(`refunds?${query}`));
			refunds.push(...page.data);
			if (!page.has_more) return refunds;
			const last = page.data.at(-1)?.id;
			if (!last || last === cursor)
				throw new Error("Invalid Stripe refund pagination");
			cursor = last;
		}
	}
	const getRefund = async (
		input: PaymentRefundInput,
	): Promise<PaymentRefundResult> => {
		const refunds = input.refundRef
			? [
					refundSchema.parse(
						await stripeRequest(
							`refunds/${encodeURIComponent(input.refundRef)}`,
						),
					),
				]
			: await listRefunds(input.paymentRef);
		const result = refunds.find((refund) =>
			input.refundRef
				? refund.id === input.refundRef
				: refund.metadata?.btstRefundKey === input.idempotencyKey,
		);
		if (!result) return { ...input, status: "uncertain" };
		return {
			paymentRef: result.payment_intent,
			amount: result.amount,
			currency: result.currency,
			refundRef: result.id,
			status:
				result.status === "succeeded"
					? "confirmed"
					: ["failed", "canceled"].includes(result.status)
						? "failed"
						: "pending",
		};
	};
	const validatePayment: NonNullable<PaymentAdapter["validatePayment"]> = ({
		amount,
	}) =>
		amount === 0 && !options.successUrl
			? "Stripe PaymentIntent requires a positive checkout amount; use hosted Checkout for free orders"
			: undefined;
	return {
		name: "stripe",
		refunds: {
			async createRefund(input) {
				const body = new URLSearchParams({
					payment_intent: input.paymentRef,
					amount: String(input.amount),
					"metadata[orderId]": input.orderId,
					"metadata[btstRefundKey]": input.idempotencyKey,
				});
				const result = refundSchema.parse(
					await stripeRequest("refunds", {
						method: "POST",
						headers: {
							"content-type": "application/x-www-form-urlencoded",
							"idempotency-key": input.idempotencyKey,
						},
						body,
					}),
				);
				if (
					result.payment_intent !== input.paymentRef ||
					result.amount !== input.amount ||
					result.currency.toUpperCase() !== input.currency.toUpperCase()
				)
					throw new Error("Stripe refund does not match the payment");
				return { refundRef: result.id };
			},
			getRefund,
		},
		validatePayment,
		async createPayment({ amount, currency, orderId, metadata }) {
			const rejection = validatePayment({ amount, currency });
			if (rejection) throw new Error(rejection);
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
			const orderMetadata = z.object({ orderId: z.string().min(1) });
			let metadata = orderMetadata.safeParse(object.metadata);
			if (
				!metadata.success &&
				(((event.type === "refund.created" ||
					event.type === "refund.updated") &&
					object.status === "succeeded") ||
					(event.type === "charge.refunded" &&
						object.refunded === true &&
						object.amount_refunded === object.amount))
			) {
				// Refund metadata is independent from the original payment's order attribution.
				const paymentRef = z.string().min(1).parse(object.payment_intent);
				const payment = z
					.object({ id: z.literal(paymentRef), metadata: z.unknown() })
					.parse(
						await stripeRequest(
							`payment_intents/${encodeURIComponent(paymentRef)}`,
						),
					);
				metadata = orderMetadata.safeParse(payment.metadata);
			}
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
				(event.type === "refund.created" || event.type === "refund.updated") &&
				object.status === "succeeded"
			) {
				status = "refunded";
				amount = object.amount;
			} else if (
				event.type === "charge.refunded" &&
				object.refunded === true &&
				object.amount_refunded === object.amount
			) {
				// A charge event can arrive while a refund is pending; only succeeded refunds confirm money.
				const paymentRef = z.string().min(1).parse(object.payment_intent);
				const refunds = await listRefunds(paymentRef);
				const succeeded = refunds.filter(
					(refund) =>
						refund.status === "succeeded" &&
						refund.payment_intent === paymentRef &&
						refund.currency === object.currency,
				);
				if (
					succeeded.reduce((sum, refund) => sum + refund.amount, 0) !==
					object.amount
				)
					return null;
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
