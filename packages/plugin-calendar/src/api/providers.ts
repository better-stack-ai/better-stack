import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type {
	Booking,
	BusyInterval,
	CalendarConnection,
	CalendarSyncState,
	ProviderCalendar,
} from "../types";
import { getBookingById, type CalendarDataAdapter } from "./getters";
import { withHostTransaction } from "./mutations";

/** Server-only account identifier. Access/refresh tokens belong in the application's credential store. */
export type CalendarProviderConnection = CalendarConnection & {
	hostId: string;
	accountId: string;
};

/** Application/provider boundary. Every write must reconcile syncKey before creating an event. */
export interface CalendarProviderAdapter {
	connect(input: {
		hostId: string;
		request?: Request;
	}): Promise<{ accountId: string; label: string }>;
	disconnect(connection: CalendarProviderConnection): Promise<void>;
	listCalendars(
		connection: CalendarProviderConnection,
	): Promise<ProviderCalendar[]>;
	getBusyIntervals(
		connection: CalendarProviderConnection,
		range: BusyInterval,
		excludeEventIds: readonly string[],
	): Promise<readonly BusyInterval[]>;
	ensureEvent(
		connection: CalendarProviderConnection,
		input: {
			calendarId: string;
			syncKey: string;
			eventId: string | null;
			booking: Readonly<Booking>;
		},
	): Promise<{ eventId: string }>;
	deleteEvent(
		connection: CalendarProviderConnection,
		input: {
			calendarId: string;
			syncKey: string;
			eventId: string | null;
		},
	): Promise<void>;
}

export type CalendarProviders = Partial<
	Record<CalendarConnection["provider"], CalendarProviderAdapter>
>;
export type ConnectionRecord = CalendarProviderConnection & {
	connectionKey: string;
};
export type SyncRecord = Omit<CalendarSyncState, "updatedAt"> & {
	hostId: string;
	syncKey: string;
	updatedAt: Date;
};

export function publicConnection(
	connection: CalendarProviderConnection,
): CalendarConnection {
	return {
		id: connection.id,
		provider: connection.provider,
		label: connection.label,
		calendarId: connection.calendarId,
		calendarName: connection.calendarName,
		status: connection.status,
	};
}
export function publicSync(row: SyncRecord): CalendarSyncState {
	return {
		id: row.id,
		bookingId: row.bookingId,
		connectionId: row.connectionId,
		calendarId: row.calendarId,
		eventId: row.eventId,
		state: row.state,
		error: row.error,
		attempts: row.attempts,
		updatedAt: new Date(row.updatedAt).toISOString(),
	};
}

export async function hostProviderRows<T>(
	adapter: CalendarDataAdapter,
	model: string,
	hostId: string,
): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await adapter.findMany<T>({
			model,
			where: [{ field: "hostId", value: hostId }],
			offset,
			limit: 500,
			sortBy: { field: "id", direction: "asc" },
		});
		rows.push(...page);
		if (page.length < 500) return rows;
	}
}
export async function connectionById(adapter: CalendarDataAdapter, id: string) {
	const row = await adapter.findOne<ConnectionRecord>({
		model: "calendarConnection",
		where: [{ field: "id", value: id }],
	});
	if (!row)
		throw new OperationHttpError(
			404,
			"Calendar connection not found",
			"CALENDAR_CONNECTION_NOT_FOUND",
		);
	return row;
}
export async function syncById(adapter: CalendarDataAdapter, id: string) {
	const row = await adapter.findOne<SyncRecord>({
		model: "calendarSync",
		where: [{ field: "id", value: id }],
	});
	if (!row)
		throw new OperationHttpError(
			404,
			"Calendar synchronization not found",
			"CALENDAR_SYNC_NOT_FOUND",
		);
	return row;
}

/** Queue within the booking transaction, so committed transitions always have a durable retry. */
export async function queueBookingSync(
	adapter: CalendarDataAdapter,
	booking: Readonly<Booking>,
) {
	if (booking.status === "pending_payment") return;
	const connections = await hostProviderRows<ConnectionRecord>(
		adapter,
		"calendarConnection",
		booking.hostId,
	);
	for (const connection of connections) {
		if (connection.status !== "connected" || !connection.calendarId) continue;
		const existing = await adapter.findOne<SyncRecord>({
			model: "calendarSync",
			where: [
				{ field: "connectionId", value: connection.id },
				{ field: "bookingId", value: booking.id },
			],
		});
		if (existing) {
			await adapter.update({
				model: "calendarSync",
				where: [{ field: "id", value: existing.id }],
				update: { state: "pending", error: null, updatedAt: new Date() },
			});
		} else if (booking.status === "confirmed") {
			await adapter.create({
				model: "calendarSync",
				data: {
					hostId: booking.hostId,
					bookingId: booking.id,
					connectionId: connection.id,
					calendarId: connection.calendarId,
					syncKey: crypto.randomUUID(),
					eventId: null,
					state: "pending",
					error: null,
					attempts: 0,
					updatedAt: new Date(),
				},
			});
		}
	}
}

/** Provider errors are persisted after the local booking commits; never expose provider error bodies. */
export async function runCalendarSync(
	adapter: Adapter,
	providers: CalendarProviders | undefined,
	id: string,
) {
	const initial = await syncById(adapter, id);
	return withHostTransaction(adapter, initial.hostId, async (tx) => {
		const row = await syncById(tx, id);
		const connection = await connectionById(tx, row.connectionId);
		const provider = providers?.[connection.provider];
		const booking = await getBookingById(tx, row.bookingId);
		try {
			if (!provider || connection.status !== "connected" || !booking)
				throw new Error("Provider unavailable");
			let eventId = row.eventId;
			if (booking.status === "cancelled") {
				await provider.deleteEvent(connection, row);
			} else if (booking.status === "confirmed") {
				const event = await provider.ensureEvent(connection, {
					...row,
					booking,
				});
				if (!event.eventId) throw new Error("Provider event is missing");
				eventId = event.eventId;
			} else throw new Error("Booking is not confirmed");
			const saved = await tx.update<SyncRecord>({
				model: "calendarSync",
				where: [{ field: "id", value: row.id }],
				update: {
					eventId,
					state: "synced",
					error: null,
					attempts: row.attempts + 1,
					updatedAt: new Date(),
				},
			});
			return publicSync(saved!);
		} catch {
			const saved = await tx.update<SyncRecord>({
				model: "calendarSync",
				where: [{ field: "id", value: row.id }],
				update: {
					state: "failed",
					error:
						"Calendar synchronization failed. Reconnect if needed, then retry.",
					attempts: row.attempts + 1,
					updatedAt: new Date(),
				},
			});
			return publicSync(saved!);
		}
	});
}

export async function syncBooking(
	adapter: Adapter,
	providers: CalendarProviders | undefined,
	booking: Readonly<Booking>,
) {
	const rows = await hostProviderRows<SyncRecord>(
		adapter,
		"calendarSync",
		booking.hostId,
	);
	for (const row of rows) {
		if (row.bookingId === booking.id && row.state !== "synced")
			await runCalendarSync(adapter, providers, row.id);
	}
}

export async function providerBusyIntervals(
	adapter: CalendarDataAdapter,
	providers: CalendarProviders | undefined,
	hostId: string,
	range: BusyInterval,
) {
	const connections = await hostProviderRows<ConnectionRecord>(
		adapter,
		"calendarConnection",
		hostId,
	);
	const mappings = await hostProviderRows<SyncRecord>(
		adapter,
		"calendarSync",
		hostId,
	);
	const busy: BusyInterval[] = [];
	for (const connection of connections) {
		if (connection.status !== "connected") continue;
		const provider = providers?.[connection.provider];
		if (!provider || !connection.calendarId)
			throw new OperationHttpError(
				503,
				"Select and reconnect your external calendar before accepting bookings",
				"CALENDAR_PROVIDER_UNAVAILABLE",
			);
		try {
			busy.push(
				...(await provider.getBusyIntervals(
					connection,
					range,
					mappings
						.filter((row) => row.connectionId === connection.id && row.eventId)
						.map((row) => row.eventId!),
				)),
			);
		} catch {
			throw new OperationHttpError(
				503,
				"External calendar availability could not be verified",
				"CALENDAR_PROVIDER_UNAVAILABLE",
			);
		}
	}
	return busy;
}
