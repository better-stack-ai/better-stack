import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { describe, expect, it, vi } from "vitest";
import { createAnalyticsServerHooks } from "../api/bridges";
import { analyticsBackendPlugin } from "../api/plugin";
import { createAnalyticsClientHooks } from "../client/bridges";
import type { AnalyticsCustomEvent } from "../types";
import type { CalendarBackendHooks } from "../../../plugin-calendar/src/api/operations";
import type { EcommerceBackendHooks } from "../../../plugin-ecommerce/src/api/operations";
import type { FeatureFlagsPluginHooks } from "../../../plugin-feature-flags/src/api/operations";
import type { FormBuilderBackendHooks } from "../../../plugin-form-builder/src/types";
import type { NewsletterPluginHooks } from "../../../plugin-newsletter/src/types";
import type { SchoolPluginHooks } from "../../../plugin-school/src/types";

function setup(
	session: Parameters<typeof createAnalyticsServerHooks>[0]["session"] = () =>
		"consented-anonymous-session-123",
) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api/data",
		plugins: {
			analytics: analyticsBackendPlugin({
				sessionSecret: "stable-server-secret-123",
			}),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	const hooks = createAnalyticsServerHooks({
		recordEvent: (event) => stack.trusted.analytics.recordEvent(event),
		session,
	});
	// These assignments protect the optional integration boundary without runtime imports.
	hooks.calendar satisfies CalendarBackendHooks;
	hooks.ecommerce satisfies EcommerceBackendHooks;
	hooks.featureFlags satisfies FeatureFlagsPluginHooks;
	hooks.formBuilder satisfies FormBuilderBackendHooks;
	hooks.newsletter satisfies NewsletterPluginHooks;
	hooks.school satisfies SchoolPluginHooks;
	return {
		hooks,
		rows: () =>
			adapter.findMany<AnalyticsCustomEvent>({ model: "customEvent" }),
	};
}

describe("analytics lifecycle bridges", () => {
	it("records a delivered variant and conversions under one hashed anonymous session", async () => {
		const { hooks, rows } = setup();
		const context = {
			request: new Request("https://app.test/submit?token=private"),
		};
		await hooks.featureFlags.onEvaluate(
			{ key: "checkout-layout" },
			true,
			{
				email: "private@example.test",
				tags: ["private"],
				userId: "private-user",
			},
			{ ...context, variant: "compact" },
		);
		await hooks.formBuilder.onAfterSubmission(
			{ data: { password: "private" } },
			{ id: "form-1" },
			context,
		);
		await hooks.newsletter.onAfterSubscribe({ status: "subscribed" }, context);
		await hooks.calendar.onAfterConfirmBooking({
			eventTypeId: "event-1",
			status: "confirmed",
		});
		await hooks.calendar.onAfterRescheduleBooking(
			{ eventTypeId: "event-1", status: "confirmed" },
			{ cancelToken: "private" },
		);
		await hooks.ecommerce.onAfterOrderPaid(
			{
				subtotal: 5000,
				discount: 1000,
				currency: "USD",
				paymentStatus: "paid",
			},
			context,
		);
		await hooks.school.onAfterEnroll(
			{ status: "enrolled" },
			{ id: "course-1" },
		);
		await hooks.school.onAfterCourseComplete(
			{ status: "completed" },
			{ id: "course-1" },
		);
		const events = await rows();
		expect(events.map((event) => event.name)).toEqual([
			"feature_flag_evaluated",
			"form_submitted",
			"newsletter_subscribed",
			"booking_confirmed",
			"booking_rescheduled",
			"order_paid",
			"course_enrolled",
			"course_completed",
		]);
		expect(new Set(events.map((event) => event.sessionId)).size).toBe(1);
		expect(events[0]?.sessionId).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.parse(events[0]!.properties!)).toEqual({
			flag: "checkout-layout",
			result: true,
			variant: "compact",
		});
		expect(JSON.parse(events[5]!.properties!)).toEqual({
			revenue: 4000,
			currency: "USD",
		});
		expect(JSON.stringify(events)).not.toMatch(
			/private|consented-anonymous|password|cancelToken|email|userId/,
		);
	});

	it("skips collection without consent, and honors DNT/GPC before resolving a session", async () => {
		const session = vi.fn(() => null);
		const { hooks, rows } = setup(session);
		await hooks.school.onAfterEnroll(
			{ status: "enrolled" },
			{ id: "course-1" },
		);
		for (const header of ["dnt", "sec-gpc"]) {
			await hooks.featureFlags.onEvaluate(
				{ key: "test" },
				true,
				{},
				{
					variant: "A",
					request: new Request("https://app.test", {
						headers: { [header]: "1" },
					}),
				},
			);
		}
		expect(session).toHaveBeenCalledTimes(1);
		expect(await rows()).toEqual([]);
	});

	it("does not turn pending/unsubscribed/unpaid records into conversions", async () => {
		const { hooks, rows } = setup();
		await hooks.newsletter.onAfterSubscribe({ status: "unsubscribed" }, {});
		await hooks.calendar.onAfterConfirmBooking({
			eventTypeId: "event",
			status: "pending_payment",
		});
		await hooks.calendar.onAfterRescheduleBooking(
			{ eventTypeId: "event", status: "cancelled" },
			{},
		);
		await hooks.school.onAfterEnroll(
			{ status: "pending_payment" },
			{ id: "course" },
		);
		await hooks.school.onAfterCourseComplete(
			{ status: "enrolled" },
			{ id: "course" },
		);
		await hooks.ecommerce.onAfterOrderPaid(
			{ subtotal: 100, discount: 0, currency: "USD", paymentStatus: "pending" },
			{},
		);
		expect(await rows()).toEqual([]);
	});

	it("keeps the ingestion validation and lifecycle hooks on the server path", async () => {
		const recordEvent = vi.fn(async () => undefined);
		const hooks = createAnalyticsServerHooks({
			recordEvent,
			session: () => "opaque-session-123456",
		});
		await hooks.featureFlags.onEvaluate(
			{ key: "test" },
			false,
			{},
			{ variant: null },
		);
		expect(recordEvent).toHaveBeenCalledWith({
			name: "feature_flag_evaluated",
			path: "/feature-flags",
			properties: { flag: "test", result: false, variant: null },
			sessionId: "opaque-session-123456",
		});
		const { hooks: invalid } = setup(() => "short");
		await expect(
			invalid.school.onAfterEnroll({ status: "enrolled" }, { id: "course" }),
		).rejects.toThrow();
	});

	it("uses the provided browser tracker and its existing session, without server ingestion", async () => {
		const track = vi.fn(async () => true);
		const hooks = createAnalyticsClientHooks({ track });
		await hooks.ecommerce.onAfterOrderPaid(
			{ subtotal: 1500, discount: 200, currency: "EUR", paymentStatus: "paid" },
			{},
		);
		expect(track).toHaveBeenCalledWith("order_paid", {
			revenue: 1300,
			currency: "EUR",
		});
	});
});
