import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	type DeepReadonly,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { calendarPermissions } from "../permissions";
import {
	availabilityQuerySchema,
	createBookingSchema,
	createEventTypeSchema,
	listBookingsQuerySchema,
} from "../schemas";
import { calculateAvailability, dateInTimezone } from "../scheduling";
import type { Booking, EventType } from "../types";
import {
	getBookingById,
	getBookingByToken,
	getEventType,
	getEventTypeBySlug,
	listEventTypes,
	listHostBookings,
	type CalendarDataAdapter,
} from "./getters";
import * as mutations from "./mutations";

/** Booking lifecycle callbacks. Confirmation/cancellation run after commit; failures do not undo reservations. */
export type CalendarBackendHooks = {
	onBeforeCreateBooking?: (
		input: DeepReadonly<z.output<typeof createBookingSchema>>,
	) => Promise<void> | void;
	onAfterConfirmBooking?: (
		booking: DeepReadonly<Booking>,
	) => Promise<void> | void;
	onAfterCancelBooking?: (
		booking: DeepReadonly<Booking>,
	) => Promise<void> | void;
	onBeforeRemindBooking?: (
		booking: DeepReadonly<Booking>,
	) => Promise<void> | void;
	onAfterRemindBooking?: (
		booking: DeepReadonly<Booking>,
	) => Promise<void> | void;
};

/** Calendar configuration; adapters must advertise enabled transaction support. */
export type CalendarBackendOptions = { hooks?: CalendarBackendHooks };

const hostInput = z.object({ hostId: z.string().min(1).optional() });
const idInput = z.object({ id: z.string().min(1) });
const slugInput = z.object({ slug: z.string().min(1) });
export const createEventTypeOperationSchema = createEventTypeSchema.extend({
	hostId: z.string().min(1).optional(),
});
export const updateEventTypeOperationSchema = idInput.extend({
	data: createEventTypeSchema,
});
export const availabilityOperationSchema = availabilityQuerySchema.extend({
	slug: z.string().min(1),
});
export const createBookingOperationSchema = createBookingSchema.extend({
	slug: z.string().min(1),
});
const tokenInput = z.object({ token: z.string().min(1).max(200) });

function failure(
	status: number,
	message: string,
	code = "CALENDAR_ERROR",
): never {
	throw new OperationHttpError(status, message, code);
}

function resolveHost(context: {
	identity: { id: string } | null;
	request?: Request;
	input: { readonly hostId?: string };
}) {
	if (context.identity) return context.identity.id;
	if (context.request) return failure(401, "Sign in to manage your calendar");
	return (
		context.input.hostId ??
		failure(400, "Trusted calendar calls require a hostId")
	);
}

function requireManagementIdentity(context: {
	identity: { id: string } | null;
	request?: Request;
}) {
	if (context.request && !context.identity)
		failure(401, "Sign in to manage your calendar");
}

async function requireEvent(adapter: CalendarDataAdapter, id: string) {
	return (
		(await getEventType(adapter, id)) ?? failure(404, "Event type not found")
	);
}

async function requirePublicEvent(adapter: CalendarDataAdapter, slug: string) {
	const event = await getEventTypeBySlug(adapter, slug);
	if (!event?.active) return failure(404, "Event type not found");
	return event;
}

async function requireBooking(adapter: CalendarDataAdapter, token: string) {
	return (
		(await getBookingByToken(adapter, token)) ??
		failure(404, "Booking not found")
	);
}

function eventFacts(event: EventType) {
	return { eventTypeId: event.id, hostId: event.hostId };
}

function assertHost(event: EventType, hostId: string) {
	if (event.hostId !== hostId) failure(409, "Event ownership changed");
}

async function assertSlugAvailable(
	adapter: CalendarDataAdapter,
	slug: string,
	id?: string,
) {
	const existing = await getEventTypeBySlug(adapter, slug);
	if (existing && existing.id !== id)
		failure(409, "This booking link is already in use");
}

/** One validated, authorized operation inventory for HTTP, request calls and jobs. */
export function createCalendarOperations(
	adapter: Adapter,
	options: CalendarBackendOptions,
) {
	const cancelled = new WeakSet<object>();
	async function cancelReservation(
		input: object,
		bookingId: string,
		hostId: string,
	): Promise<Booking> {
		return mutations.withHostTransaction(adapter, hostId, async (tx) => {
			const booking =
				(await getBookingById(tx, bookingId)) ??
				failure(404, "Booking not found");
			if (booking.hostId !== hostId) failure(409, "Booking changed");
			if (booking.status === "cancelled") return booking;
			const result =
				(await mutations.cancelBooking(tx, booking.id)) ??
				failure(404, "Booking not found");
			cancelled.add(input);
			return result;
		});
	}
	async function afterCancellation(context: {
		input: object;
		result: DeepReadonly<Booking>;
	}) {
		if (cancelled.has(context.input))
			await options.hooks?.onAfterCancelBooking?.(context.result);
	}
	return {
		listEventTypes: defineOperation({
			input: hostInput,
			permission: calendarPermissions.eventType.list,
			facts: ({ input }) => ({ hostId: input.hostId }),
			execute: (context) => listEventTypes(adapter, resolveHost(context)),
		}),
		getEventType: defineOperation({
			input: idInput,
			permission: calendarPermissions.eventType.read,
			facts: async ({ input }) => ({
				...eventFacts(await requireEvent(adapter, input.id)),
				public: false,
			}),
			before: requireManagementIdentity,
			execute: ({ input }) => requireEvent(adapter, input.id),
		}),
		getPublicEventType: defineOperation({
			input: slugInput,
			permission: calendarPermissions.eventType.read,
			facts: async ({ input }) => ({
				...eventFacts(await requirePublicEvent(adapter, input.slug)),
				public: true,
			}),
			execute: ({ input }) => requirePublicEvent(adapter, input.slug),
		}),
		createEventType: defineOperation({
			input: createEventTypeOperationSchema,
			permission: calendarPermissions.eventType.create,
			facts: ({ input }) => ({ hostId: input.hostId }),
			execute: (context) => {
				const hostId = resolveHost(context);
				return mutations.withHostTransaction(adapter, hostId, async (tx) => {
					await assertSlugAvailable(tx, context.input.slug);
					return mutations.createEventType(
						tx,
						hostId,
						createEventTypeSchema.parse(context.input),
					);
				});
			},
		}),
		updateEventType: defineOperation({
			input: updateEventTypeOperationSchema,
			permission: calendarPermissions.eventType.update,
			facts: async ({ input }) =>
				eventFacts(await requireEvent(adapter, input.id)),
			before: requireManagementIdentity,
			execute: ({ input, facts }) =>
				mutations.withHostTransaction(adapter, facts.hostId, async (tx) => {
					assertHost(await requireEvent(tx, input.id), facts.hostId);
					await assertSlugAvailable(tx, input.data.slug, input.id);
					const bookings = await listHostBookings(tx, facts.hostId);
					const slotCounts = new Map<string, number>();
					for (const booking of bookings) {
						if (
							booking.eventTypeId !== input.id ||
							booking.status !== "confirmed" ||
							Date.parse(booking.end) <= Date.now()
						)
							continue;
						const count = (slotCounts.get(booking.start) ?? 0) + 1;
						if (count > input.data.capacity)
							failure(
								409,
								"Capacity cannot be lower than existing reservations",
							);
						slotCounts.set(booking.start, count);
					}
					return (
						(await mutations.updateEventType(
							tx,
							input.id,
							createEventTypeSchema.parse(input.data),
						)) ?? failure(404, "Event type not found")
					);
				}),
		}),
		deleteEventType: defineOperation({
			input: idInput,
			permission: calendarPermissions.eventType.delete,
			facts: async ({ input }) =>
				eventFacts(await requireEvent(adapter, input.id)),
			before: requireManagementIdentity,
			execute: ({ input, facts }) =>
				mutations.withHostTransaction(adapter, facts.hostId, async (tx) => {
					assertHost(await requireEvent(tx, input.id), facts.hostId);
					const bookings = await listHostBookings(tx, facts.hostId);
					if (
						bookings.some(
							(booking) =>
								booking.eventTypeId === input.id &&
								booking.status === "confirmed" &&
								Date.parse(booking.end) > Date.now(),
						)
					)
						failure(
							409,
							"Cancel upcoming bookings or deactivate this event type before deleting it",
						);
					await mutations.deleteEventType(tx, input.id);
					return { success: true as const };
				}),
		}),
		getAvailability: defineOperation({
			input: availabilityOperationSchema,
			permission: calendarPermissions.availability.read,
			facts: async ({ input }) =>
				eventFacts(await requirePublicEvent(adapter, input.slug)),
			execute: async ({ input }) => {
				const event = await requirePublicEvent(adapter, input.slug);
				return calculateAvailability(
					event,
					await listHostBookings(adapter, event.hostId),
					input.date,
					input.timezone,
				);
			},
		}),
		createBooking: defineOperation({
			input: createBookingOperationSchema,
			permission: calendarPermissions.booking.create,
			facts: async ({ input }) =>
				eventFacts(await requirePublicEvent(adapter, input.slug)),
			before: async ({ input }) =>
				options.hooks?.onBeforeCreateBooking?.(input),
			execute: ({ input, facts }) =>
				mutations.withHostTransaction(adapter, facts.hostId, async (tx) => {
					const event = await requirePublicEvent(tx, input.slug);
					assertHost(event, facts.hostId);
					if (event.id !== facts.eventTypeId)
						failure(409, "Event type changed");
					const bookings = await listHostBookings(tx, event.hostId);
					const start = new Date(input.start).toISOString();
					const availability = calculateAvailability(
						event,
						bookings,
						dateInTimezone(start, input.timezone),
						input.timezone,
					);
					const slot = availability.slots.find(
						(candidate) => candidate.start === start,
					);
					if (!slot)
						failure(
							409,
							"This time is no longer available",
							"CALENDAR_SLOT_UNAVAILABLE",
						);
					if (
						bookings.some(
							(booking) =>
								booking.eventTypeId === event.id &&
								booking.start === start &&
								booking.status === "confirmed" &&
								booking.email === input.email,
						)
					)
						failure(409, "This email already has a reservation for this time");
					return mutations.createBooking(tx, {
						eventTypeId: event.id,
						hostId: event.hostId,
						eventName: event.name,
						start: slot.start,
						end: slot.end,
						timezone: input.timezone,
						name: input.name,
						email: input.email,
					});
				}),
			after: async ({ result }) =>
				options.hooks?.onAfterConfirmBooking?.(result),
		}),
		getBooking: defineOperation({
			input: tokenInput,
			permission: calendarPermissions.booking.read,
			facts: async ({ input }) => {
				const booking = await requireBooking(adapter, input.token);
				return {
					bookingId: booking.id,
					hostId: booking.hostId,
					tokenValid: true,
				};
			},
			execute: ({ input }) => requireBooking(adapter, input.token),
		}),
		cancelBooking: defineOperation({
			input: tokenInput,
			permission: calendarPermissions.booking.cancel,
			facts: async ({ input }) => {
				const booking = await requireBooking(adapter, input.token);
				return {
					bookingId: booking.id,
					hostId: booking.hostId,
					tokenValid: true,
				};
			},
			execute: ({ input, facts }) =>
				cancelReservation(input, facts.bookingId, facts.hostId),
			after: (context) => afterCancellation(context),
		}),
		cancelHostBooking: defineOperation({
			input: idInput,
			permission: calendarPermissions.booking.cancel,
			facts: async ({ input }) => {
				const booking =
					(await getBookingById(adapter, input.id)) ??
					failure(404, "Booking not found");
				return {
					bookingId: booking.id,
					hostId: booking.hostId,
					tokenValid: false,
				};
			},
			before: requireManagementIdentity,
			execute: async ({ input, facts }): Promise<Booking> => ({
				...(await cancelReservation(input, facts.bookingId, facts.hostId)),
				cancelToken: "",
			}),
			after: (context) => afterCancellation(context),
		}),
		listBookings: defineOperation({
			input: listBookingsQuerySchema.extend({
				hostId: z.string().min(1).optional(),
			}),
			permission: calendarPermissions.booking.list,
			facts: ({ input }) => ({ hostId: input.hostId }),
			execute: async (context) => {
				const bookings = await listHostBookings(adapter, resolveHost(context));
				return bookings
					.filter((booking) => {
						if (
							context.input.eventTypeId &&
							booking.eventTypeId !== context.input.eventTypeId
						)
							return false;
						if (context.input.period === "upcoming")
							return Date.parse(booking.end) > Date.now();
						if (context.input.period === "past")
							return Date.parse(booking.end) <= Date.now();
						return true;
					})
					.sort((a, b) => a.start.localeCompare(b.start))
					.map((booking) => ({ ...booking, cancelToken: "" }));
			},
		}),
		remindBooking: defineOperation({
			input: idInput,
			permission: calendarPermissions.booking.remind,
			facts: async ({ input }) => {
				const booking =
					(await getBookingById(adapter, input.id)) ??
					failure(404, "Booking not found");
				return { bookingId: booking.id, hostId: booking.hostId };
			},
			execute: async ({ input, facts }) => {
				const booking =
					(await getBookingById(adapter, input.id)) ??
					failure(404, "Booking not found");
				if (
					booking.hostId !== facts.hostId ||
					booking.status !== "confirmed" ||
					Date.parse(booking.start) <= Date.now()
				)
					failure(409, "Only upcoming confirmed bookings can be reminded");
				await options.hooks?.onBeforeRemindBooking?.(booking);
				return booking;
			},
			after: async ({ result }) =>
				options.hooks?.onAfterRemindBooking?.(result),
		}),
	};
}
