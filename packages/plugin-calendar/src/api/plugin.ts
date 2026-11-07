import { z } from "zod";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { calendarSchema } from "../db";
import {
	availabilityQuerySchema,
	createBookingSchema,
	createEventTypeSchema,
	listBookingsQuerySchema,
	rescheduleBookingSchema,
} from "../schemas";
import {
	createCalendarOperations,
	type CalendarBackendOptions,
} from "./operations";

import {
	connectCalendarProviderSchema,
	selectProviderCalendarSchema,
} from "./provider-operations";

export const calendarBackendPlugin = (options: CalendarBackendOptions = {}) =>
	defineBackendPlugin({
		id: "calendar",
		dbPlugin: calendarSchema,
		operations: (adapter) => createCalendarOperations(adapter, options),
		routes: (_adapter, _context, operations) => ({
			listCalendarConnections: createEndpoint(
				"/calendar/connections",
				{ method: "GET", requireRequest: true },
				operations.listCalendarConnections.route(() => ({})),
			),
			connectCalendarProvider: createEndpoint(
				"/calendar/connections",
				{
					method: "POST",
					body: connectCalendarProviderSchema,
					requireRequest: true,
				},
				operations.connectCalendarProvider.route((ctx) => ctx.body),
			),
			listProviderCalendars: createEndpoint(
				"/calendar/connections/:id/calendars",
				{ method: "GET", requireRequest: true },
				operations.listProviderCalendars.route((ctx) => ({
					id: ctx.params.id,
				})),
			),
			selectProviderCalendar: createEndpoint(
				"/calendar/connections/:id",
				{
					method: "PATCH",
					body: selectProviderCalendarSchema,
					requireRequest: true,
				},
				operations.selectProviderCalendar.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			disconnectCalendarProvider: createEndpoint(
				"/calendar/connections/:id",
				{ method: "DELETE", requireRequest: true },
				operations.disconnectCalendarProvider.route((ctx) => ({
					id: ctx.params.id,
				})),
			),
			retryCalendarSync: createEndpoint(
				"/calendar/sync/:id/retry",
				{ method: "POST", requireRequest: true },
				operations.retryCalendarSync.route((ctx) => ({ id: ctx.params.id })),
			),
			listEventTypes: createEndpoint(
				"/calendar/events",
				{ method: "GET", requireRequest: true },
				operations.listEventTypes.route(() => ({})),
			),
			getEventType: createEndpoint(
				"/calendar/events/:id",
				{ method: "GET", requireRequest: true },
				operations.getEventType.route((ctx) => ({ id: ctx.params.id })),
			),
			createEventType: createEndpoint(
				"/calendar/events",
				{ method: "POST", body: createEventTypeSchema, requireRequest: true },
				operations.createEventType.route((ctx) => ctx.body),
			),
			updateEventType: createEndpoint(
				"/calendar/events/:id",
				{ method: "PATCH", body: createEventTypeSchema, requireRequest: true },
				operations.updateEventType.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteEventType: createEndpoint(
				"/calendar/events/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteEventType.route((ctx) => ({ id: ctx.params.id })),
			),
			getPublicEventType: createEndpoint(
				"/calendar/book/:slug",
				{ method: "GET", requireRequest: true },
				operations.getPublicEventType.route((ctx) => ({
					slug: ctx.params.slug,
				})),
			),
			getAvailability: createEndpoint(
				"/calendar/book/:slug/slots",
				{ method: "GET", query: availabilityQuerySchema, requireRequest: true },
				operations.getAvailability.route((ctx) => ({
					slug: ctx.params.slug,
					...ctx.query,
				})),
			),
			createBooking: createEndpoint(
				"/calendar/book/:slug",
				{ method: "POST", body: createBookingSchema, requireRequest: true },
				operations.createBooking.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { slug: ctx.params.slug, ...ctx.body };
				}),
			),
			joinWaitlist: createEndpoint(
				"/calendar/book/:slug/waitlist",
				{ method: "POST", body: createBookingSchema, requireRequest: true },
				operations.joinWaitlist.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { slug: ctx.params.slug, ...ctx.body };
				}),
			),
			getWaitlistEntry: createEndpoint(
				"/calendar/waitlist/:token",
				{ method: "GET", requireRequest: true },
				operations.getWaitlistEntry.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { token: ctx.params.token };
				}),
			),
			verifyWaitlistEntry: createEndpoint(
				"/calendar/waitlist/:token/verify",
				{ method: "POST", requireRequest: true },
				operations.verifyWaitlistEntry.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { token: ctx.params.token };
				}),
			),
			cancelWaitlistEntry: createEndpoint(
				"/calendar/waitlist/:token/cancel",
				{ method: "POST", requireRequest: true },
				operations.cancelWaitlistEntry.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { token: ctx.params.token };
				}),
			),
			acceptWaitlistOffer: createEndpoint(
				"/calendar/waitlist/:token/accept",
				{ method: "POST", requireRequest: true },
				operations.acceptWaitlistOffer.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { token: ctx.params.token };
				}),
			),
			listWaitlist: createEndpoint(
				"/calendar/waitlist",
				{
					method: "GET",
					query: z.object({ eventTypeId: z.string().min(1).optional() }),
					requireRequest: true,
				},
				operations.listWaitlist.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			handlePaymentWebhook: createEndpoint(
				"/calendar/webhook",
				{ method: "POST", requireRequest: true, disableBody: true },
				operations.handlePaymentWebhook.route(() => ({})),
			),
			createBookingCheckout: createEndpoint(
				"/calendar/cancel/:token/checkout",
				{ method: "POST", requireRequest: true },
				operations.createBookingCheckout.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { token: ctx.params.token };
				}),
			),
			getBooking: createEndpoint(
				"/calendar/cancel/:token",
				{ method: "GET", requireRequest: true },
				operations.getBooking.route((ctx) => ({ token: ctx.params.token })),
			),
			getRescheduleAvailability: createEndpoint(
				"/calendar/reschedule/:token/slots",
				{ method: "GET", query: availabilityQuerySchema, requireRequest: true },
				operations.getRescheduleAvailability.route((ctx) => ({
					token: ctx.params.token,
					...ctx.query,
				})),
			),
			rescheduleBooking: createEndpoint(
				"/calendar/reschedule/:token",
				{ method: "POST", body: rescheduleBookingSchema, requireRequest: true },
				operations.rescheduleBooking.route((ctx) => ({
					token: ctx.params.token,
					...ctx.body,
				})),
			),
			cancelBooking: createEndpoint(
				"/calendar/cancel/:token",
				{ method: "POST", requireRequest: true },
				operations.cancelBooking.route((ctx) => ({ token: ctx.params.token })),
			),
			cancelHostBooking: createEndpoint(
				"/calendar/bookings/:id/cancel",
				{ method: "POST", requireRequest: true },
				operations.cancelHostBooking.route((ctx) => ({ id: ctx.params.id })),
			),
			listBookings: createEndpoint(
				"/calendar/bookings",
				{ method: "GET", query: listBookingsQuerySchema, requireRequest: true },
				operations.listBookings.route((ctx) => ctx.query),
			),
		}),
	});

export type CalendarApiRouter = ReturnType<
	ReturnType<typeof calendarBackendPlugin>["routes"]
>;
