import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type { createEventTypeSchema } from "../schemas";
import type {
	Booking,
	BookingRecord,
	EventTypeRecord,
	WaitlistRecord,
} from "../types";
import {
	serializeBooking,
	serializeEventType,
	type CalendarDataAdapter,
} from "./getters";

const hostQueues = new WeakMap<Adapter, Map<string, Promise<unknown>>>();

/**
 * Serialize host writes. SQL adapters must hold the host-row write lock until
 * transaction commit; the queue also provides isolation for the memory adapter.
 * Lower-level primitive: callers own authorization, validation and lifecycle.
 */
export function withHostTransaction<T>(
	adapter: Adapter,
	hostId: string,
	run: (tx: CalendarDataAdapter) => Promise<T>,
): Promise<T> {
	return withHostsTransaction(adapter, [hostId], run);
}

/** Lock every participating host in a stable order in one transaction. */
export async function withHostsTransaction<T>(
	adapter: Adapter,
	hostIds: readonly string[],
	run: (tx: CalendarDataAdapter) => Promise<T>,
): Promise<T> {
	if (!adapter.options?.adapterConfig.transaction) {
		throw new OperationHttpError(
			503,
			"Calendar writes require an adapter with transactions enabled",
			"CALENDAR_TRANSACTIONS_REQUIRED",
		);
	}
	const hosts = [...new Set(hostIds)].sort();
	const keys =
		adapter.options.adapterConfig.adapterId === "memory" ? ["*"] : hosts;
	let queues = hostQueues.get(adapter);
	if (!queues) {
		queues = new Map();
		hostQueues.set(adapter, queues);
	}
	const previous = keys.map((key) => queues!.get(key) ?? Promise.resolve());
	const operation = Promise.all(
		previous.map((pending) => pending.catch(() => {})),
	).then(async () => {
		for (const hostId of hosts) {
			const host = await adapter.findOne<{ id: string }>({
				model: "calendarHost",
				where: [{ field: "hostId", value: hostId }],
			});
			if (!host) {
				try {
					await adapter.create({
						model: "calendarHost",
						data: { hostId, lockVersion: crypto.randomUUID() },
					});
				} catch (error) {
					if (
						!(await adapter.findOne({
							model: "calendarHost",
							where: [{ field: "hostId", value: hostId }],
						}))
					)
						throw error;
				}
			}
		}
		return adapter.transaction(async (tx) => {
			for (const hostId of hosts) {
				const locked = await tx.update({
					model: "calendarHost",
					where: [{ field: "hostId", value: hostId }],
					update: { lockVersion: crypto.randomUUID() },
				});
				if (!locked)
					throw new OperationHttpError(
						409,
						"Calendar host changed",
						"CALENDAR_HOST_CHANGED",
					);
			}
			return run(tx);
		});
	});
	for (const key of keys) queues.set(key, operation);
	try {
		return await operation;
	} finally {
		for (const key of keys)
			if (queues.get(key) === operation) queues.delete(key);
	}
}

function eventData(input: z.output<typeof createEventTypeSchema>) {
	return {
		...input,
		price: input.price ?? null,
		currency: input.currency ?? null,
		teamAvailabilityIds: JSON.stringify(input.teamAvailabilityIds),
		weeklyAvailability: JSON.stringify(input.weeklyAvailability),
		dateOverrides: JSON.stringify(input.dateOverrides),
		limits: JSON.stringify(input.limits),
	};
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function createEventType(
	adapter: CalendarDataAdapter,
	hostId: string,
	input: z.output<typeof createEventTypeSchema>,
) {
	return serializeEventType(
		await adapter.create<EventTypeRecord>({
			model: "calendarEventType",
			data: {
				...eventData(input),
				hostId,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		}),
	);
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function updateEventType(
	adapter: CalendarDataAdapter,
	id: string,
	input: z.output<typeof createEventTypeSchema>,
) {
	const updated = await adapter.update<EventTypeRecord>({
		model: "calendarEventType",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { ...eventData(input), updatedAt: new Date() },
	});
	return updated ? serializeEventType(updated) : null;
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function deleteEventType(
	adapter: CalendarDataAdapter,
	id: string,
) {
	await adapter.delete({
		model: "calendarEventType",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function createBooking(
	adapter: CalendarDataAdapter,
	input: Omit<Booking, "id" | "cancelToken" | "createdAt" | "status">,
	status: "confirmed" | "pending_payment" = "confirmed",
	payment?: string,
	metadata?: Pick<
		BookingRecord,
		"availabilityEventTypeId" | "requestKey" | "requestFingerprint"
	>,
) {
	return serializeBooking(
		await adapter.create<BookingRecord>({
			model: "calendarBooking",
			data: {
				...input,
				start: new Date(input.start),
				end: new Date(input.end),
				status,
				payment: payment ?? null,
				...metadata,
				cancelToken: crypto.randomUUID() + crypto.randomUUID(),
				createdAt: new Date(),
			},
		}),
	);
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function rescheduleBooking(
	adapter: CalendarDataAdapter,
	id: string,
	input: Pick<Booking, "start" | "end" | "timezone">,
) {
	const row = await adapter.update<BookingRecord>({
		model: "calendarBooking",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			...input,
			start: new Date(input.start),
			end: new Date(input.end),
		},
	});
	return row ? serializeBooking(row) : null;
}

/** Lower-level write: callers own validation, authorization, transaction and lifecycle. */
export async function cancelBooking(adapter: CalendarDataAdapter, id: string) {
	const row = await adapter.update<BookingRecord>({
		model: "calendarBooking",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { status: "cancelled" },
	});
	return row ? serializeBooking(row) : null;
}

/** Lower-level write: callers own payment verification, validation, authorization, transaction and lifecycle. */
export async function confirmBookingPayment(
	adapter: CalendarDataAdapter,
	id: string,
) {
	const row = await adapter.update<BookingRecord>({
		model: "calendarBooking",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { status: "confirmed" },
	});
	return row ? serializeBooking(row) : null;
}

/** Lower-level write: callers own validation, authorization and the host transaction. */
export function createWaitlistEntry(
	adapter: CalendarDataAdapter,
	input: Omit<WaitlistRecord, "id">,
) {
	return adapter.create<WaitlistRecord>({
		model: "calendarWaitlist",
		data: input,
	});
}

/** Lower-level write: callers own validation, authorization and the host transaction. */
export async function updateWaitlistEntry(
	adapter: CalendarDataAdapter,
	id: string,
	update: Partial<WaitlistRecord>,
) {
	const row = await adapter.update<WaitlistRecord>({
		model: "calendarWaitlist",
		where: [{ field: "id", value: id }],
		update,
	});
	if (!row)
		throw new OperationHttpError(
			404,
			"Waitlist entry not found",
			"CALENDAR_WAITLIST_NOT_FOUND",
		);
	return row;
}
