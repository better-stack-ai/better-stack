import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type {
	Availability,
	Booking,
	BookingCheckout,
	EventType,
	CalendarConnection,
	CalendarSyncState,
	WaitlistEntry,
} from "./types";

/**
 * Separates protected query caches by identity. Pending/error generations prevent
 * an unresolved identity from reusing a previous user's management data.
 */
export type CalendarIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;

/** Full event configuration for create/update; the server supplies ownership and metadata. */
export type CalendarEventInput = Omit<
	EventType,
	"id" | "hostId" | "createdAt" | "updatedAt"
>;

/** Booking page slug, selected ISO instant, and attendee details in the viewer's timezone. */
export interface CalendarBookingInput {
	slug: string;
	start: string;
	timezone: string;
	name: string;
	email: string;
}

/** Availability for the requested date in the viewer's timezone. */
export type CalendarSlots = Availability;

export type CalendarConnections = {
	providers: ("google" | "microsoft")[];
	connections: CalendarConnection[];
	sync: CalendarSyncState[];
};

export const calendarResources = {
	calendarConnections: {
		queries: {
			list: {
				path: "/calendar/connections",
				key: (identity?: CalendarIdentityPartition) => [identity],
				select: (data: unknown): CalendarConnections =>
					data as CalendarConnections,
			},
			calendars: {
				path: "/calendar/connections/:id/calendars",
				params: (id: string, _identity?: CalendarIdentityPartition) => ({ id }),
				key: (id: string, identity?: CalendarIdentityPartition) => [
					id,
					identity,
				],
				select: (data: unknown): { id: string; name: string }[] =>
					data as { id: string; name: string }[],
			},
		},
		mutations: {
			connect: {
				path: "@post/calendar/connections",
				method: "POST",
				input: (provider: "google" | "microsoft") => ({ body: { provider } }),
				select: (data: unknown): CalendarConnection =>
					data as CalendarConnection,
				invalidates: ["calendarConnections"],
				refresh: false,
			},
			select: {
				path: "@patch/calendar/connections/:id",
				method: "PATCH",
				input: ({ id, calendarId }: { id: string; calendarId: string }) => ({
					params: { id },
					body: { calendarId },
				}),
				select: (data: unknown): CalendarConnection =>
					data as CalendarConnection,
				invalidates: [
					"calendarConnections",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
			disconnect: {
				path: "@delete/calendar/connections/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: [
					"calendarConnections",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
		},
	},
	calendarSync: {
		queries: {},
		mutations: {
			retry: {
				path: "@post/calendar/sync/:id/retry",
				method: "POST",
				input: (id: string) => ({ params: { id } }),
				select: (data: unknown): CalendarSyncState => data as CalendarSyncState,
				invalidates: [
					"calendarConnections",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
		},
	},
	calendarEvents: {
		queries: {
			list: {
				path: "/calendar/events",
				key: (identity?: CalendarIdentityPartition) => [identity],
				select: (data: unknown): EventType[] => data as EventType[],
			},
			detail: {
				path: "/calendar/events/:id",
				params: (id: string, _identity?: CalendarIdentityPartition) => ({ id }),
				key: (id: string, identity?: CalendarIdentityPartition) => [
					id,
					identity,
				],
				select: (data: unknown): EventType => data as EventType,
			},
		},
		mutations: {
			create: {
				path: "@post/calendar/events",
				method: "POST",
				input: (data: CalendarEventInput) => ({ body: data }),
				select: (data: unknown): EventType => data as EventType,
				invalidates: ["calendarEvents"],
				refresh: false,
			},
			update: {
				path: "@patch/calendar/events/:id",
				method: "PATCH",
				input: ({ id, data }: { id: string; data: CalendarEventInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): EventType => data as EventType,
				invalidates: [
					"calendarEvents",
					"calendarPublicEvents",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
			delete: {
				path: "@delete/calendar/events/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: [
					"calendarEvents",
					"calendarPublicEvents",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
		},
	},
	calendarPublicEvents: {
		queries: {
			detail: {
				path: "/calendar/book/:slug",
				params: (slug: string) => ({ slug }),
				select: (data: unknown): EventType => data as EventType,
			},
		},
	},
	calendarSlots: {
		queries: {
			list: {
				path: "/calendar/book/:slug/slots",
				params: (slug: string, _date: string, _timezone: string) => ({ slug }),
				query: (_slug: string, date: string, timezone: string) => ({
					date,
					timezone,
				}),
				select: (data: unknown): CalendarSlots => data as CalendarSlots,
			},
		},
	},
	calendarRescheduleSlots: {
		queries: {
			list: {
				path: "/calendar/reschedule/:token/slots",
				params: (token: string, _date: string, _timezone: string) => ({
					token,
				}),
				query: (_token: string, date: string, timezone: string) => ({
					date,
					timezone,
				}),
				select: (data: unknown): CalendarSlots => data as CalendarSlots,
			},
		},
	},
	calendarWaitlist: {
		queries: {
			list: {
				path: "/calendar/waitlist",
				key: (identity?: CalendarIdentityPartition) => [identity],
				select: (data: unknown): Omit<WaitlistEntry, "token">[] =>
					data as Omit<WaitlistEntry, "token">[],
			},
			detail: {
				path: "/calendar/waitlist/:token",
				params: (token: string) => ({ token }),
				select: (data: unknown): WaitlistEntry => data as WaitlistEntry,
			},
		},
		mutations: {
			join: {
				path: "@post/calendar/book/:slug/waitlist",
				method: "POST",
				input: ({ slug, ...body }: CalendarBookingInput) => ({
					params: { slug },
					body,
				}),
				select: (data: unknown): { success: true } => data as { success: true },
				refresh: false,
			},
			verify: {
				path: "@post/calendar/waitlist/:token/verify",
				method: "POST",
				input: (token: string) => ({ params: { token } }),
				select: (data: unknown): WaitlistEntry => data as WaitlistEntry,
				invalidates: ["calendarWaitlist"],
				refresh: false,
			},
			cancel: {
				path: "@post/calendar/waitlist/:token/cancel",
				method: "POST",
				input: (token: string) => ({ params: { token } }),
				select: (data: unknown): WaitlistEntry => data as WaitlistEntry,
				invalidates: [
					"calendarWaitlist",
					"calendarSlots",
					"calendarRescheduleSlots",
				],
				refresh: false,
			},
			accept: {
				path: "@post/calendar/waitlist/:token/accept",
				method: "POST",
				input: (token: string) => ({ params: { token } }),
				select: (data: unknown): BookingCheckout => data as BookingCheckout,
				invalidates: [
					"calendarWaitlist",
					"calendarSlots",
					"calendarRescheduleSlots",
					"calendarBookings",
					"calendarConnections",
				],
				refresh: false,
			},
		},
	},
	calendarBookings: {
		queries: {
			list: {
				path: "/calendar/bookings",
				query: (
					period: "upcoming" | "past" | "all",
					_identity?: CalendarIdentityPartition,
				) => ({ period }),
				key: (
					period: "upcoming" | "past" | "all",
					identity?: CalendarIdentityPartition,
				) => [period, identity],
				select: (data: unknown): Omit<Booking, "cancelToken">[] =>
					data as Omit<Booking, "cancelToken">[],
			},
			detail: {
				path: "/calendar/cancel/:token",
				params: (token: string) => ({ token }),
				select: (data: unknown): Booking => data as Booking,
			},
		},
		mutations: {
			create: {
				path: "@post/calendar/book/:slug",
				method: "POST",
				input: ({ slug, ...body }: CalendarBookingInput) => ({
					params: { slug },
					body,
				}),
				select: (data: unknown): BookingCheckout => data as BookingCheckout,
				invalidates: [
					"calendarSlots",
					"calendarRescheduleSlots",
					"calendarBookings.list",
					"calendarConnections",
				],
				refresh: false,
			},
			checkout: {
				path: "@post/calendar/cancel/:token/checkout",
				method: "POST",
				input: (token: string) => ({ params: { token } }),
				select: (data: unknown): BookingCheckout => data as BookingCheckout,
				invalidates: ["calendarBookings"],
				refresh: false,
			},
			cancelHost: {
				path: "@post/calendar/bookings/:id/cancel",
				method: "POST",
				input: (id: string) => ({ params: { id } }),
				select: (data: unknown): Omit<Booking, "cancelToken"> =>
					data as Omit<Booking, "cancelToken">,
				invalidates: [
					"calendarSlots",
					"calendarRescheduleSlots",
					"calendarBookings",
					"calendarConnections",
				],
				refresh: false,
			},
			cancel: {
				path: "@post/calendar/cancel/:token",
				method: "POST",
				input: (token: string) => ({ params: { token } }),
				select: (data: unknown): Booking => data as Booking,
				invalidates: [
					"calendarSlots",
					"calendarRescheduleSlots",
					"calendarBookings",
					"calendarConnections",
				],
				refresh: false,
			},
			reschedule: {
				path: "@post/calendar/reschedule/:token",
				method: "POST",
				input: ({
					token,
					...body
				}: {
					token: string;
					start: string;
					timezone: string;
				}) => ({ params: { token }, body }),
				select: (data: unknown): Booking => data as Booking,
				invalidates: [
					"calendarSlots",
					"calendarRescheduleSlots",
					"calendarBookings",
					"calendarConnections",
				],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createCalendarQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, calendarResources, headers);
}
