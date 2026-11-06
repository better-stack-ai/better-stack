/** Flat, non-personal properties emitted by the built-in lifecycle bridges. */
export type AnalyticsBridgeProperties = Record<
	string,
	string | number | boolean | null
>;

/** A lifecycle event before the server or browser transport supplies its session. */
export interface AnalyticsBridgeEvent {
	name: string;
	path: string;
	properties: AnalyticsBridgeProperties;
}

/** Source hooks provide an HTTP request where their public contract supports it. */
export interface AnalyticsBridgeContext {
	readonly request?: Request;
}

/** Explicit transport boundary; source plugin packages are not imported by Analytics. */
export type AnalyticsBridgeSink = (
	event: AnalyticsBridgeEvent,
	context: AnalyticsBridgeContext,
) => Promise<void>;

/**
 * Build callbacks compatible with the source plugins' public lifecycle hooks.
 * Only allowlisted dimensions are forwarded; submitted fields, identities,
 * addresses, payment credentials and flag payload/targeting are never copied.
 */
export function createAnalyticsLifecycleHooks(record: AnalyticsBridgeSink) {
	const emit = (
		name: string,
		path: string,
		properties: AnalyticsBridgeProperties,
		context: AnalyticsBridgeContext = {},
	) => record({ name, path, properties }, context);
	return {
		featureFlags: {
			onEvaluate: (
				flag: { readonly key: string },
				result: boolean,
				_context: unknown,
				context: AnalyticsBridgeContext & { readonly variant?: string | null },
			) =>
				emit(
					"feature_flag_evaluated",
					"/feature-flags",
					{ flag: flag.key, result, variant: context.variant ?? null },
					context,
				),
		},
		formBuilder: {
			onAfterSubmission: (
				_submission: unknown,
				form: { readonly id: string },
				context: AnalyticsBridgeContext,
			) => emit("form_submitted", "/forms", { formId: form.id }, context),
		},
		newsletter: {
			onAfterSubscribe: (
				subscriber: { readonly status: string },
				context: AnalyticsBridgeContext,
			) =>
				subscriber.status === "subscribed"
					? emit("newsletter_subscribed", "/newsletter", {}, context)
					: undefined,
		},
		calendar: {
			onAfterConfirmBooking: (
				booking: {
					readonly eventTypeId: string;
					readonly status: string;
				},
				context?: { readonly reason?: "rescheduled" },
			) =>
				booking.status === "confirmed" && context?.reason !== "rescheduled"
					? emit("booking_confirmed", "/calendar", {
							eventTypeId: booking.eventTypeId,
						})
					: undefined,
			onAfterRescheduleBooking: (
				booking: { readonly eventTypeId: string; readonly status: string },
				_previous: unknown,
			) =>
				booking.status === "confirmed"
					? emit("booking_rescheduled", "/calendar", {
							eventTypeId: booking.eventTypeId,
						})
					: undefined,
		},
		ecommerce: {
			onAfterOrderPaid: (
				order: {
					readonly subtotal: number;
					readonly discount: number;
					readonly currency: string;
					readonly paymentStatus: string;
				},
				context: AnalyticsBridgeContext,
			) =>
				order.paymentStatus === "paid"
					? emit(
							"order_paid",
							"/store",
							{
								revenue: order.subtotal - order.discount,
								currency: order.currency,
							},
							context,
						)
					: undefined,
		},
		school: {
			onAfterEnroll: (
				enrollment: { readonly status: string },
				course: { readonly id: string },
			) =>
				enrollment.status === "enrolled"
					? emit("course_enrolled", "/learn", { courseId: course.id })
					: undefined,
			onAfterCourseComplete: (
				enrollment: { readonly status: string },
				course: { readonly id: string },
			) =>
				enrollment.status === "completed"
					? emit("course_completed", "/learn", { courseId: course.id })
					: undefined,
		},
	};
}
