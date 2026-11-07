import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import type { ProviderCalendar } from "../types";
import { calendarPermissions } from "../permissions";
import { listHostBookings } from "./getters";
import { withHostTransaction } from "./mutations";
import {
	connectionById,
	hostProviderRows,
	publicConnection,
	publicSync,
	queueBookingSync,
	runCalendarSync,
	syncById,
	type CalendarProviders,
	type ConnectionRecord,
	type SyncRecord,
} from "./providers";

const hostInput = z.object({ hostId: z.string().min(1).optional() });
const idInput = z.object({ id: z.string().min(1) });
export const connectCalendarProviderSchema = z.object({
	provider: z.enum(["google", "microsoft"]),
});
export const selectProviderCalendarSchema = z.object({
	calendarId: z.string().min(1).max(2000),
});
function fail(status: number, message: string): never {
	throw new OperationHttpError(status, message, "CALENDAR_CONNECTION_ERROR");
}
function host(context: {
	identity: { id: string } | null;
	request?: Request;
	input: { readonly hostId?: string };
}) {
	if (context.identity) return context.identity.id;
	if (context.request) fail(401, "Sign in to manage your calendar");
	return (
		context.input.hostId ?? fail(400, "Trusted calendar calls require a hostId")
	);
}
function owner(context: {
	identity: { id: string } | null;
	request?: Request;
	facts: { readonly hostId?: string };
}) {
	if (
		context.request &&
		(!context.identity ||
			(context.facts.hostId !== undefined &&
				context.identity.id !== context.facts.hostId))
	)
		fail(403, "This calendar belongs to another host");
}

export function createProviderOperations(
	adapter: Adapter,
	providers?: CalendarProviders,
) {
	function provider(name: "google" | "microsoft") {
		return (
			providers?.[name] ?? fail(503, "This calendar provider is unavailable")
		);
	}
	const connectionFacts = async ({
		input,
	}: {
		input: { readonly id: string };
	}) => {
		const connection = await connectionById(adapter, input.id);
		return { hostId: connection.hostId, connectionId: connection.id };
	};
	return {
		listCalendarConnections: defineOperation({
			input: hostInput,
			permission: calendarPermissions.connection.list,
			facts: ({ input }) => ({ hostId: input.hostId }),
			execute: async (context) => {
				const hostId = host(context);
				return {
					providers: Object.keys(providers ?? {}) as ("google" | "microsoft")[],
					connections: (
						await hostProviderRows<ConnectionRecord>(
							adapter,
							"calendarConnection",
							hostId,
						)
					).map(publicConnection),
					sync: (
						await hostProviderRows<SyncRecord>(adapter, "calendarSync", hostId)
					).map(publicSync),
				};
			},
		}),
		connectCalendarProvider: defineOperation({
			input: connectCalendarProviderSchema.extend(hostInput.shape),
			permission: calendarPermissions.connection.connect,
			facts: ({ input }) => ({ hostId: input.hostId }),
			before: owner,
			execute: async (context) => {
				const hostId = host(context);
				return withHostTransaction(adapter, hostId, async (tx) => {
					const connectionKey = JSON.stringify([
						hostId,
						context.input.provider,
					]);
					const existing = await tx.findOne<ConnectionRecord>({
						model: "calendarConnection",
						where: [{ field: "connectionKey", value: connectionKey }],
					});
					if (existing?.status === "disconnecting")
						fail(409, "Finish disconnecting this calendar before reconnecting");
					if (existing?.status === "connected")
						return publicConnection(existing);
					let account: { accountId: string; label: string };
					try {
						account = await provider(context.input.provider).connect({
							hostId,
							request: context.request,
						});
					} catch {
						fail(
							503,
							"Complete the application's calendar authorization, then reconnect",
						);
					}
					const data = {
						hostId,
						provider: context.input.provider,
						connectionKey,
						accountId: account!.accountId,
						label: account!.label,
						calendarId: null,
						calendarName: null,
						status: "connected" as const,
					};
					const row = existing
						? await tx.update<ConnectionRecord>({
								model: "calendarConnection",
								where: [{ field: "id", value: existing.id }],
								update: data,
							})
						: await tx.create<ConnectionRecord>({
								model: "calendarConnection",
								data,
							});
					return publicConnection(row!);
				});
			},
		}),
		listProviderCalendars: defineOperation({
			input: idInput,
			permission: calendarPermissions.connection.manage,
			facts: connectionFacts,
			before: owner,
			execute: async ({ input }) => {
				const connection = await connectionById(adapter, input.id);
				if (connection.status !== "connected")
					fail(409, "Reconnect this account first");
				try {
					return await provider(connection.provider).listCalendars(connection);
				} catch {
					return fail(
						503,
						"Could not load provider calendars. Reconnect and retry.",
					);
				}
			},
		}),
		selectProviderCalendar: defineOperation({
			input: idInput.extend(selectProviderCalendarSchema.shape),
			permission: calendarPermissions.connection.manage,
			facts: connectionFacts,
			before: owner,
			execute: async ({ input, facts }) =>
				withHostTransaction(adapter, facts.hostId, async (tx) => {
					const connection = await connectionById(tx, input.id);
					if (connection.status !== "connected")
						fail(409, "Reconnect this account first");
					if (
						connection.calendarId &&
						connection.calendarId !== input.calendarId
					) {
						const mappings = await hostProviderRows<SyncRecord>(
							tx,
							"calendarSync",
							facts.hostId,
						);
						if (mappings.some((row) => row.connectionId === connection.id))
							fail(
								409,
								"Disconnect this account before changing the synchronized calendar",
							);
					}
					let calendars: ProviderCalendar[];
					try {
						calendars = await provider(connection.provider).listCalendars(
							connection,
						);
					} catch {
						return fail(503, "Could not verify provider calendars");
					}
					const selected =
						calendars.find((calendar) => calendar.id === input.calendarId) ??
						fail(400, "Select an available provider calendar");
					const row = await tx.update<ConnectionRecord>({
						model: "calendarConnection",
						where: [{ field: "id", value: connection.id }],
						update: { calendarId: selected.id, calendarName: selected.name },
					});
					for (const booking of await listHostBookings(tx, facts.hostId)) {
						if (
							booking.status === "confirmed" &&
							Date.parse(booking.end) > Date.now()
						)
							await queueBookingSync(tx, booking);
					}
					return publicConnection(row!);
				}),
			after: async ({ facts }) => {
				for (const row of await hostProviderRows<SyncRecord>(
					adapter,
					"calendarSync",
					facts.hostId,
				)) {
					if (row.state !== "synced")
						await runCalendarSync(adapter, providers, row.id);
				}
			},
		}),
		disconnectCalendarProvider: defineOperation({
			input: idInput,
			permission: calendarPermissions.connection.manage,
			facts: connectionFacts,
			before: owner,
			execute: async ({ input, facts }) => {
				const connection = await withHostTransaction(
					adapter,
					facts.hostId,
					async (tx) => {
						const current = await connectionById(tx, input.id);
						if (current.status === "disconnected") return null;
						if (current.status === "disconnecting") return current;
						try {
							const external = provider(current.provider);
							for (const row of await hostProviderRows<SyncRecord>(
								tx,
								"calendarSync",
								facts.hostId,
							)) {
								if (row.connectionId === current.id)
									await external.deleteEvent(current, row);
							}
						} catch {
							return fail(
								503,
								"Could not clean up the external calendar. Retry disconnecting.",
							);
						}
						return tx.update<ConnectionRecord>({
							model: "calendarConnection",
							where: [{ field: "id", value: current.id }],
							update: { status: "disconnecting" },
						});
					},
				);
				if (!connection) return { success: true as const };
				return withHostTransaction(adapter, facts.hostId, async (tx) => {
					const current = await connectionById(tx, input.id);
					if (current.status === "disconnected")
						return { success: true as const };
					if (current.status !== "disconnecting")
						fail(409, "Calendar connection changed; retry disconnecting");
					try {
						await provider(current.provider).disconnect(current);
					} catch {
						return fail(
							503,
							"Calendar cleanup is complete. Retry disconnecting to finish credential revocation.",
						);
					}
					await tx.update({
						model: "calendarConnection",
						where: [{ field: "id", value: input.id }],
						update: {
							status: "disconnected",
							calendarId: null,
							calendarName: null,
						},
					});
					for (const row of await hostProviderRows<SyncRecord>(
						tx,
						"calendarSync",
						facts.hostId,
					)) {
						if (row.connectionId === connection.id)
							await tx.delete({
								model: "calendarSync",
								where: [{ field: "id", value: row.id }],
							});
					}
					return { success: true as const };
				});
			},
		}),
		retryCalendarSync: defineOperation({
			input: idInput,
			permission: calendarPermissions.sync.retry,
			facts: async ({ input }) => {
				const row = await syncById(adapter, input.id);
				return { hostId: row.hostId, syncId: row.id };
			},
			before: owner,
			execute: ({ input }) => runCalendarSync(adapter, providers, input.id),
		}),
	};
}
