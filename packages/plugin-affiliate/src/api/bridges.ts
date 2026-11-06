import { attributionFromRequest } from "../attribution";
import { createConversionSchema } from "../schemas";
import type { CreateConversionInput } from "../types";

/** Application-owned conversion operation; source plugins remain independently installable. */
export interface AffiliateConversionBridgeOptions {
	/** Call the configured stack's trusted.affiliate.createConversion operation. Errors propagate for payment webhook retry. */
	recordConversion: (input: CreateConversionInput) => Promise<unknown>;
}

type Attribution = { readonly code?: string; readonly clickId?: string };
type PaymentContext = {
	readonly payment?: {
		readonly amount: number;
		readonly currency: string;
		readonly attribution?: Attribution;
	};
};

/**
 * Capture browser attribution before checkout and record only verified paid
 * conversions using the stored snapshot. External references are namespaced by
 * source entity; the Affiliate operation deduplicates retries and commissions.
 */
export function createAffiliateConversionHooks(
	options: AffiliateConversionBridgeOptions,
) {
	const capturePaymentAttribution = ({ request }: { request?: Request }) => {
		if (!request) return undefined;
		const parsed = createConversionSchema.shape.attribution.safeParse(
			attributionFromRequest(request),
		);
		return parsed.success ? parsed.data : undefined;
	};
	async function paid(source: string, id: string, context?: PaymentContext) {
		const payment = context?.payment;
		if (!payment?.attribution) return;
		await options.recordConversion({
			externalRef: `${source}:${id}`,
			amount: payment.amount,
			currency: payment.currency,
			attribution: payment.attribution,
		});
	}
	return {
		ecommerce: {
			capturePaymentAttribution,
			async onAfterOrderPaid(
				order: {
					readonly id: string;
					readonly paymentStatus: string;
					readonly subtotal: number;
					readonly discount: number;
					readonly currency: string;
				},
				context: { readonly attribution?: Attribution },
			) {
				if (order.paymentStatus !== "paid") return;
				await paid("ecommerce", order.id, {
					payment: {
						amount: order.subtotal - order.discount,
						currency: order.currency,
						attribution: context.attribution,
					},
				});
			},
		},
		school: {
			capturePaymentAttribution,
			async onAfterEnroll(
				enrollment: { readonly id: string; readonly status: string },
				_course: unknown,
				context?: PaymentContext,
			) {
				if (
					enrollment.status !== "enrolled" &&
					enrollment.status !== "completed"
				)
					return;
				await paid("school", enrollment.id, context);
			},
		},
		calendar: {
			capturePaymentAttribution,
			async onAfterConfirmBooking(
				booking: { readonly id: string; readonly status: string },
				context?: PaymentContext & { readonly reason?: "rescheduled" },
			) {
				if (booking.status !== "confirmed" || context?.reason === "rescheduled")
					return;
				await paid("calendar", booking.id, context);
			},
		},
	};
}
