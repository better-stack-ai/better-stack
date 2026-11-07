import type { PaymentCheckout } from "@btst/stack/payments";
/** Host-local wall-clock interval, using HH:mm and exclusive end (24:00 allowed). */
export type TimeInterval = { start: string; end: string };
/** Repeating host availability; Sunday is 0 and Saturday is 6. */
export type WeeklyAvailability = TimeInterval & { dayOfWeek: number };
/** Replaces weekly availability on a host-local YYYY-MM-DD date; [] blocks the date. */
export type DateOverride = { date: string; intervals: TimeInterval[] };
/** Reserved attendee limits per event type, in host-local calendar periods; total is lifetime. */
export type BookingLimits = {
	perHour?: number;
	perDay?: number;
	perWeek?: number;
	total?: number;
};

/** Event configuration serialized for HTTP and React Query. Duration is real elapsed minutes. */
export type EventType = {
	id: string;
	hostId: string;
	slug: string;
	name: string;
	description: string;
	location: string;
	duration: number;
	capacity: number;
	/** Enable verified email waitlists for full group slots. */
	waitlistEnabled?: boolean;
	/** Optional nonnegative price in minor currency units; null/zero means free. */
	price?: number | null;
	/** Three-letter uppercase currency code, supplied together with price. */
	currency?: string | null;
	timezone: string;
	weeklyAvailability: WeeklyAvailability[];
	dateOverrides: DateOverride[];
	limits: BookingLimits;
	active: boolean;
	createdAt: string;
	updatedAt: string;
};

/** Reservation with ISO instants. cancelToken is a private bearer secret; management responses redact it. */
export type Booking = {
	id: string;
	eventTypeId: string;
	hostId: string;
	eventName: string;
	start: string;
	end: string;
	timezone: string;
	name: string;
	email: string;
	status: "confirmed" | "pending_payment" | "cancelled";
	cancelToken: string;
	/** Whether this booking has an adapter-managed checkout. */
	hasCheckout?: boolean;
	createdAt: string;
};

/** UTC ISO slot instants and the remaining attendee reservations, including booking limits. */
export type AvailableSlot = { start: string; end: string; remaining: number };
/** External calendar occupancy as absolute instants, with an exclusive end. */
export type BusyInterval = { start: Date; end: Date };
/** Availability for one viewer-local date in the requested IANA timezone. */
export type Availability = {
	slots: AvailableSlot[];
	/** Full group slots that still satisfy all other scheduling rules. */
	waitlistSlots?: AvailableSlot[];
	date: string;
	timezone: string;
};

/** Storage shape: structured configuration is JSON text and timestamps are Date values. */
export type EventTypeRecord = Omit<
	EventType,
	"weeklyAvailability" | "dateOverrides" | "limits" | "createdAt" | "updatedAt"
> & {
	weeklyAvailability: string;
	dateOverrides: string;
	limits: string;
	createdAt: Date;
	updatedAt: Date;
};

/** Storage shape of a reservation, including its private cancellation token. */
export type BookingRecord = Omit<Booking, "start" | "end" | "createdAt"> & {
	/** Private provider state, never serialized into booking reads. */
	payment?: string | null;
	start: Date;
	end: Date;
	createdAt: Date;
};

/** Checkout is returned only on reservation or token-authorized checkout requests. */
export type BookingCheckout = Booking & {
	checkout?: PaymentCheckout;
	checkoutError?: string;
};

/** Safe connection details returned to the owning host. Credentials remain in the application. */
export type CalendarConnection = {
	id: string;
	provider: "google" | "microsoft";
	label: string;
	calendarId: string | null;
	calendarName: string | null;
	status: "connected" | "disconnecting" | "disconnected";
};

export type ProviderCalendar = { id: string; name: string };

/** Persisted outbox entry and provider event mapping, visible only to its owning host. */
export type CalendarSyncState = {
	id: string;
	bookingId: string;
	connectionId: string;
	calendarId: string;
	eventId: string | null;
	state: "pending" | "synced" | "failed";
	error: string | null;
	attempts: number;
	updatedAt: string;
};

/** Secret-authorized attendee view. Host listings redact token; never publish this object. */
export type WaitlistEntry = {
	id: string;
	eventTypeId: string;
	hostId: string;
	eventName: string;
	start: string;
	end: string;
	timezone: string;
	name: string;
	email: string;
	status:
		| "unverified"
		| "waiting"
		| "offered"
		| "accepted"
		| "cancelled"
		| "expired";
	token: string;
	expiresAt: string;
	offerExpiresAt: string | null;
	bookingId: string | null;
	createdAt: string;
	verifiedAt: string | null;
};
/** Storage shape with Date timestamps and private delivery bookkeeping. */
export type WaitlistRecord = Omit<
	WaitlistEntry,
	"start" | "end" | "expiresAt" | "offerExpiresAt" | "createdAt" | "verifiedAt"
> & {
	start: Date;
	end: Date;
	expiresAt: Date;
	offerExpiresAt: Date | null;
	createdAt: Date;
	verifiedAt: Date | null;
	offerDelivered: boolean;
};
