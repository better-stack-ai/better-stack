import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { calendarSchema } from "../db";
import {
	availabilityQuerySchema,
	createBookingSchema,
	createEventTypeSchema,
	listBookingsQuerySchema,
} from "../schemas";
import {
	createCalendarOperations,
	type CalendarBackendOptions,
} from "./operations";

export const calendarBackendPlugin = (options: CalendarBackendOptions = {}) =>
	defineBackendPlugin({
		id: "calendar",
		dbPlugin: calendarSchema,
		operations: (adapter) => createCalendarOperations(adapter, options),
		routes: (_adapter, _context, operations) => ({
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
				operations.createBooking.route((ctx) => ({
					slug: ctx.params.slug,
					...ctx.body,
				})),
			),
			getBooking: createEndpoint(
				"/calendar/cancel/:token",
				{ method: "GET", requireRequest: true },
				operations.getBooking.route((ctx) => ({ token: ctx.params.token })),
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
