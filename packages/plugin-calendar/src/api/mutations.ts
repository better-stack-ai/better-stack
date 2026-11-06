import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type { createEventTypeSchema } from "../schemas";
import type { Booking, BookingRecord, EventTypeRecord } from "../types";
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
export async function withHostTransaction<T>(
	adapter: Adapter,
	hostId: string,
	run: (tx: CalendarDataAdapter) => Promise<T>,
): Promise<T> {
	if (!adapter.options?.adapterConfig.transaction) {
		throw new OperationHttpError(
			503,
			"Calendar writes require an adapter with transactions enabled",
			"CALENDAR_TRANSACTIONS_REQUIRED",
		);
	}
	// Memory transactions do not enforce unique indexes or isolate concurrent hosts.
	const queueKey =
		adapter.options.adapterConfig.adapterId === "memory" ? "*" : hostId;
	let queues = hostQueues.get(adapter);
	if (!queues) {
		queues = new Map();
		hostQueues.set(adapter, queues);
	}
	const previous = queues.get(queueKey) ?? Promise.resolve();
	const operation = previous
		.catch(() => {})
		.then(async () => {
			const host = await adapter.findOne<{ id: string }>({
				model: "calendarHost",
				where: [{ field: "hostId", value: hostId, operator: "eq" }],
			});
			if (!host) {
				try {
					await adapter.create({
						model: "calendarHost",
						data: { hostId, lockVersion: crypto.randomUUID() },
					});
				} catch (error) {
					const created = await adapter.findOne({
						model: "calendarHost",
						where: [{ field: "hostId", value: hostId, operator: "eq" }],
					});
					if (!created) throw error;
				}
			}
			return adapter.transaction(async (tx) => {
				const locked = await tx.update({
					model: "calendarHost",
					where: [{ field: "hostId", value: hostId, operator: "eq" }],
					update: { lockVersion: crypto.randomUUID() },
				});
				if (!locked)
					throw new OperationHttpError(
						409,
						"Calendar host changed",
						"CALENDAR_HOST_CHANGED",
					);
				return run(tx);
			});
		});
	queues.set(queueKey, operation);
	try {
		return await operation;
	} finally {
		if (queues.get(queueKey) === operation) queues.delete(queueKey);
	}
}

function eventData(input: z.output<typeof createEventTypeSchema>) {
	return {
		...input,
		price: input.price ?? null,
		currency: input.currency ?? null,
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
) {
	return serializeBooking(
		await adapter.create<BookingRecord>({
			model: "calendarBooking",
			data: {
				...input,
				start: new Date(input.start),
				end: new Date(input.end),
				status,
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
