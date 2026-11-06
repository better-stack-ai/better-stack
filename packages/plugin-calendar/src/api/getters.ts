import type { DBAdapter } from "@btst/db";
import type {
	Booking,
	BookingRecord,
	EventType,
	EventTypeRecord,
} from "../types";

/** DB methods shared by root adapters and already-open transaction adapters. */
export type CalendarDataAdapter = Omit<DBAdapter, "transaction">;
type Adapter = CalendarDataAdapter;

async function allHostRows<T>(
	adapter: Adapter,
	model: string,
	hostId: string,
): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await adapter.findMany<T>({
			model,
			where: [{ field: "hostId", value: hostId, operator: "eq" }],
			limit: 500,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		rows.push(...page);
		if (page.length < 500) return rows;
	}
}

export function serializeEventType(record: EventTypeRecord): EventType {
	return {
		...record,
		weeklyAvailability: JSON.parse(record.weeklyAvailability),
		dateOverrides: JSON.parse(record.dateOverrides),
		limits: JSON.parse(record.limits),
		createdAt: new Date(record.createdAt).toISOString(),
		updatedAt: new Date(record.updatedAt).toISOString(),
	};
}

export function serializeBooking(record: BookingRecord): Booking {
	const { payment, ...booking } = record;
	return {
		...booking,
		hasCheckout: Boolean(payment),
		start: new Date(record.start).toISOString(),
		end: new Date(record.end).toISOString(),
		createdAt: new Date(record.createdAt).toISOString(),
	};
}

/** Lower-level getter; callers own authorization. */
export async function getEventType(adapter: Adapter, id: string) {
	const row = await adapter.findOne<EventTypeRecord>({
		model: "calendarEventType",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	return row ? serializeEventType(row) : null;
}

/** Lower-level getter; callers own authorization. */
export async function getEventTypeBySlug(adapter: Adapter, slug: string) {
	const row = await adapter.findOne<EventTypeRecord>({
		model: "calendarEventType",
		where: [{ field: "slug", value: slug, operator: "eq" }],
	});
	return row ? serializeEventType(row) : null;
}

/** Lower-level getter; callers own authorization. */
export async function listEventTypes(adapter: Adapter, hostId: string) {
	const rows = await allHostRows<EventTypeRecord>(
		adapter,
		"calendarEventType",
		hostId,
	);
	return rows.map(serializeEventType);
}

/** Lower-level getter; includes PII and bearer tokens. Callers own authorization. */
export async function listHostBookings(adapter: Adapter, hostId: string) {
	const rows = await allHostRows<BookingRecord>(
		adapter,
		"calendarBooking",
		hostId,
	);
	return rows.map(serializeBooking);
}

/** Lower-level getter; callers own authorization and token handling. */
export async function getBookingByToken(adapter: Adapter, token: string) {
	const row = await adapter.findOne<BookingRecord>({
		model: "calendarBooking",
		where: [{ field: "cancelToken", value: token, operator: "eq" }],
	});
	return row ? serializeBooking(row) : null;
}

/** Lower-level getter; callers own authorization. */
export async function getBookingById(adapter: Adapter, id: string) {
	const row = await adapter.findOne<BookingRecord>({
		model: "calendarBooking",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	return row ? serializeBooking(row) : null;
}
