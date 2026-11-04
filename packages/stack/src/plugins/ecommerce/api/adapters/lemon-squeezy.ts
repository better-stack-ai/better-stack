import { z } from "zod";
import type { PaymentAdapter, PaymentWebhookResult } from "../payment-adapter";
import { verifyHmac } from "./signatures";

/** Lemon Squeezy requires a generic one-time-payment variant in the store currency. */
export interface LemonSqueezyAdapterOptions {
	/** Store that owns the generic checkout variant. */
	storeId: string;
	/** Generic single-payment variant. Disable buyer quantity changes and use tax-inclusive pricing. */
	variantId: string;
	/** Redirect after payment; `{orderId}` is replaced with the local order ID. */
	redirectUrl?: string;
	/** Match the provider's test mode. @default false */
	testMode?: boolean;
}
/** Signed Lemon Squeezy checkout integration. The provider amount must equal the store's reserved total. */
export function lemonSqueezyAdapter(
	apiKey: string,
	webhookSecret: string,
	options: LemonSqueezyAdapterOptions,
): PaymentAdapter {
	if (!apiKey || !webhookSecret)
		throw new Error("Lemon Squeezy API key and webhook secret are required");
	z.string().regex(/^\d+$/).parse(options.storeId);
	z.string().regex(/^\d+$/).parse(options.variantId);
	if (
		options.redirectUrl &&
		!/^https?:\/\//.test(z.url().parse(options.redirectUrl))
	)
		throw new Error("Lemon Squeezy redirect must use HTTP(S)");
	const validatePayment: NonNullable<PaymentAdapter["validatePayment"]> = ({
		amount,
	}) =>
		amount > 0
			? undefined
			: "Lemon Squeezy requires a positive checkout amount";
	return {
		name: "lemon-squeezy",
		validatePayment,
		async createPayment({ amount, currency, orderId, metadata }) {
			const rejection = validatePayment({ amount, currency });
			if (rejection) throw new Error(rejection);
			const response = await fetch(
				"https://api.lemonsqueezy.com/v1/checkouts",
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${apiKey}`,
						accept: "application/vnd.api+json",
						"content-type": "application/vnd.api+json",
					},
					body: JSON.stringify({
						data: {
							type: "checkouts",
							attributes: {
								custom_price: amount,
								test_mode: options.testMode ?? false,
								checkout_options: { discount: false },
								product_options: {
									enabled_variants: [Number(options.variantId)],
									...(options.redirectUrl
										? {
												redirect_url: options.redirectUrl.replace(
													"{orderId}",
													encodeURIComponent(orderId),
												),
											}
										: {}),
								},
								checkout_data: {
									...(metadata?.email ? { email: metadata.email } : {}),
									custom: { orderId, currency },
								},
							},
							relationships: {
								store: { data: { type: "stores", id: options.storeId } },
								variant: { data: { type: "variants", id: options.variantId } },
							},
						},
					}),
				},
			);
			if (!response.ok)
				throw new Error("Lemon Squeezy payment initialization failed");
			const result = z
				.object({ data: z.object({ attributes: z.object({ url: z.url() }) }) })
				.parse(await response.json());
			return { redirectUrl: result.data.attributes.url };
		},
		async handleWebhook(request): Promise<PaymentWebhookResult | null> {
			const raw = await request.text();
			if (
				!(await verifyHmac(
					webhookSecret,
					raw,
					request.headers.get("x-signature") ?? "",
				))
			)
				throw new Error("Invalid Lemon Squeezy signature");
			const event = z
				.object({
					meta: z.object({
						event_name: z.string(),
						custom_data: z.object({ orderId: z.string() }).optional(),
					}),
					data: z.object({
						id: z.string(),
						type: z.string(),
						attributes: z.object({
							store_id: z.number(),
							test_mode: z.boolean(),
							status: z.string(),
							total: z.number().int().min(0),
							currency: z.string(),
							refunded: z.boolean().optional(),
							first_order_item: z.object({ variant_id: z.number() }).optional(),
						}),
					}),
				})
				.parse(JSON.parse(raw));
			if (!event.meta.custom_data || event.data.type !== "orders") return null;
			const attributes = event.data.attributes;
			if (
				String(attributes.store_id) !== options.storeId ||
				attributes.test_mode !== (options.testMode ?? false) ||
				(attributes.first_order_item &&
					String(attributes.first_order_item.variant_id) !== options.variantId)
			)
				throw new Error("Lemon Squeezy store, variant or mode mismatch");
			if (
				event.meta.event_name === "order_created" &&
				attributes.status === "paid"
			)
				return {
					orderId: event.meta.custom_data.orderId,
					status: "paid",
					paymentRef: event.data.id,
					amount: attributes.total,
					currency: attributes.currency,
				};
			if (
				event.meta.event_name === "order_refunded" &&
				attributes.refunded === true
			)
				return {
					orderId: event.meta.custom_data.orderId,
					status: "refunded",
					paymentRef: event.data.id,
					amount: attributes.total,
					currency: attributes.currency,
				};
			return null;
		},
	};
}
