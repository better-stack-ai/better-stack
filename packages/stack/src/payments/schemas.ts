import { z } from "zod";

/** Validate the normalized event before matching it to a pending payment. */
export const paymentWebhookResultSchema = z.object({
	orderId: z.string().min(1),
	status: z.enum(["paid", "failed", "refunded"]),
	paymentRef: z.string().min(1),
	amount: z.number().int().min(0),
	currency: z.string().regex(/^[A-Za-z]{3}$/),
});

/** Validate provider checkout data before storing or exposing its destination. */
export const paymentCheckoutSchema = z
	.object({
		clientSecret: z
			.string()
			.refine(
				(value) => value.trim().length > 0,
				"Client secret must not be empty",
			)
			.optional(),
		redirectUrl: z.url({ protocol: /^https?$/ }).optional(),
	})
	.refine(
		(value) =>
			value.clientSecret !== undefined || value.redirectUrl !== undefined,
		"A client secret or redirect URL is required",
	);
