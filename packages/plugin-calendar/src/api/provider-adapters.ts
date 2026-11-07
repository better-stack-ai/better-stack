import { z } from "zod";
import type { BusyInterval } from "../types";
import type {
	CalendarProviderAdapter,
	CalendarProviderConnection,
} from "./providers";

/** Application-owned OAuth and encrypted credential storage. Never pass this to client configuration. */
export type CalendarProviderCredentials = {
	/** Finish an application-verified OAuth flow bound to this host; return only public account metadata. */
	connect: CalendarProviderAdapter["connect"];
	/** Load credentials server-side and refresh expired tokens before returning an access token. */
	getAccessToken: (connection: CalendarProviderConnection) => Promise<string>;
	/** Revoke the provider grant and remove the application's stored credentials. */
	disconnect: CalendarProviderAdapter["disconnect"];
};

const googleBase = "https://www.googleapis.com/calendar/v3";
const microsoftBase = "https://graph.microsoft.com/v1.0";
const syncProperty =
	"String {8d366803-5d37-448e-8e66-94b4cf5f190e} Name btstSyncKey";
const eventIdSchema = z.object({ id: z.string().min(1) });
const instantSchema = z.iso.datetime({ offset: true });

function transport(credentials: CalendarProviderCredentials, base: string) {
	return async (
		connection: CalendarProviderConnection,
		path: string,
		method = "GET",
		body?: unknown,
		allowed: number[] = [],
	) => {
		const url = new URL(path.startsWith("https:") ? path : `${base}${path}`);
		if (
			url.origin !== new URL(base).origin ||
			!url.pathname.startsWith(`${new URL(base).pathname}/`)
		)
			throw new Error("Invalid calendar provider pagination URL");
		const response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${await credentials.getAccessToken(connection)}`,
				"Content-Type": "application/json",
				Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(15_000),
			redirect: "error",
		});
		if (!response.ok && !allowed.includes(response.status))
			throw new Error(`Calendar provider request failed (${response.status})`);
		return response;
	};
}

async function stableId(key: string) {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);
	return Array.from(new Uint8Array(bytes), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function absolute(value: string) {
	return new Date(instantSchema.parse(value));
}

// Date-only Google events use the calendar's zone, including DST boundaries.
function midnight(date: string, timezone: string) {
	const target = Date.parse(`${date}T00:00:00Z`);
	const formatter = new Intl.DateTimeFormat("sv-SE", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
	let instant = target;
	for (let attempt = 0; attempt < 4; attempt++) {
		const rendered = formatter.format(new Date(instant)).replace(" ", "T");
		const correction = target - Date.parse(`${rendered}Z`);
		if (correction === 0) return new Date(instant);
		instant += correction;
	}
	throw new Error("Calendar all-day boundary could not be resolved");
}

/** Google Calendar v3 adapter. The application owns OAuth, refresh, storage and revocation. */
export function googleCalendarAdapter(
	credentials: CalendarProviderCredentials,
): CalendarProviderAdapter {
	const request = transport(credentials, googleBase);
	const path = (calendarId: string) =>
		`/calendars/${encodeURIComponent(calendarId)}/events`;
	async function pages(connection: CalendarProviderConnection, route: string) {
		const items: unknown[] = [];
		let token: string | undefined;
		let timezone = "UTC";
		do {
			const url = new URL(`${googleBase}${route}`);
			if (token) url.searchParams.set("pageToken", token);
			const data = z
				.object({
					items: z.array(z.unknown()).optional(),
					nextPageToken: z.string().optional(),
					timeZone: z.string().optional(),
				})
				.parse(await (await request(connection, url.href)).json());
			items.push(...(data.items ?? []));
			token = data.nextPageToken;
			timezone = data.timeZone ?? timezone;
		} while (token);
		return { items, timezone };
	}
	return {
		connect: credentials.connect,
		disconnect: credentials.disconnect,
		async listCalendars(connection) {
			const { items } = await pages(
				connection,
				"/users/me/calendarList?minAccessRole=writer",
			);
			return items.map((item) => {
				const calendar = z
					.object({ id: z.string().min(1), summary: z.string() })
					.parse(item);
				return { id: calendar.id, name: calendar.summary };
			});
		},
		async getBusyIntervals(connection, range, excluded) {
			if (!connection.calendarId) throw new Error("Select a provider calendar");
			const query = new URLSearchParams({
				timeMin: range.start.toISOString(),
				timeMax: range.end.toISOString(),
				singleEvents: "true",
			});
			const { items, timezone } = await pages(
				connection,
				`${path(connection.calendarId)}?${query}`,
			);
			const intervals: BusyInterval[] = [];
			for (const item of items) {
				const event = z
					.object({
						id: z.string(),
						status: z.string().optional(),
						transparency: z.string().optional(),
						start: z
							.object({
								dateTime: z.string().optional(),
								date: z.iso.date().optional(),
							})
							.optional(),
						end: z
							.object({
								dateTime: z.string().optional(),
								date: z.iso.date().optional(),
							})
							.optional(),
					})
					.parse(item);
				if (
					excluded.includes(event.id) ||
					event.status === "cancelled" ||
					event.transparency === "transparent"
				)
					continue;
				const boundary = (value: typeof event.start) =>
					value?.dateTime
						? absolute(value.dateTime)
						: midnight(z.iso.date().parse(value?.date), timezone);
				intervals.push({
					start: boundary(event.start),
					end: boundary(event.end),
				});
			}
			return intervals;
		},
		async ensureEvent(connection, input) {
			const id = input.eventId ?? (await stableId(input.syncKey));
			const route = `${path(input.calendarId)}/${encodeURIComponent(id)}`;
			const existing = await request(
				connection,
				route,
				"GET",
				undefined,
				[404, 410],
			);
			const body = {
				summary: input.booking.eventName,
				start: { dateTime: input.booking.start },
				end: { dateTime: input.booking.end },
				extendedProperties: { private: { btstSyncKey: input.syncKey } },
			};
			if (existing.ok) {
				const event = z
					.object({
						status: z.string().optional(),
						extendedProperties: z.object({
							private: z.object({ btstSyncKey: z.string() }),
						}),
					})
					.parse(await existing.json());
				if (
					event.status === "cancelled" ||
					event.extendedProperties.private.btstSyncKey !== input.syncKey
				)
					throw new Error("External event was removed or changed ownership");
				await request(connection, route, "PATCH", body);
			} else {
				if (input.eventId || existing.status === 410)
					throw new Error(
						"External event was removed; resolve the booking in BTST",
					);
				// A timeout is retried by looking up this same deterministic event ID.
				await request(connection, path(input.calendarId), "POST", {
					id,
					...body,
				});
			}
			return { eventId: id };
		},
		async deleteEvent(connection, input) {
			const id = input.eventId ?? (await stableId(input.syncKey));
			await request(
				connection,
				`${path(input.calendarId)}/${encodeURIComponent(id)}`,
				"DELETE",
				undefined,
				[404, 410],
			);
		},
	};
}

/** Microsoft Graph v1 adapter with a durable marker for reconciling ambiguous create responses. */
export function microsoftCalendarAdapter(
	credentials: CalendarProviderCredentials,
): CalendarProviderAdapter {
	const request = transport(credentials, microsoftBase);
	const path = (id: string) => `/me/calendars/${encodeURIComponent(id)}`;
	async function list(connection: CalendarProviderConnection, route: string) {
		const values: unknown[] = [];
		let next: string | undefined = route;
		do {
			const data = z
				.object({
					value: z.array(z.unknown()),
					"@odata.nextLink": z.string().optional(),
				})
				.parse(await (await request(connection, next)).json());
			values.push(...data.value);
			next = data["@odata.nextLink"];
		} while (next);
		return values;
	}
	async function find(
		connection: CalendarProviderConnection,
		input: { calendarId: string; syncKey: string; eventId: string | null },
	) {
		if (input.eventId) return input.eventId;
		const escaped = input.syncKey.replaceAll("'", "''");
		const query = new URLSearchParams({
			$filter: `singleValueExtendedProperties/Any(ep: ep/id eq '${syncProperty}' and ep/value eq '${escaped}')`,
		});
		const matches = await list(
			connection,
			`${path(input.calendarId)}/events?${query}`,
		);
		if (matches.length > 1)
			throw new Error(
				"Duplicate provider event mappings require host reconciliation",
			);
		return matches[0] ? eventIdSchema.parse(matches[0]).id : null;
	}
	return {
		connect: credentials.connect,
		disconnect: credentials.disconnect,
		async listCalendars(connection) {
			return (await list(connection, "/me/calendars")).flatMap((item) => {
				const calendar = z
					.object({
						id: z.string().min(1),
						name: z.string(),
						canEdit: z.boolean(),
					})
					.parse(item);
				return calendar.canEdit
					? [{ id: calendar.id, name: calendar.name }]
					: [];
			});
		},
		async getBusyIntervals(connection, range, excluded) {
			if (!connection.calendarId) throw new Error("Select a provider calendar");
			const query = new URLSearchParams({
				startDateTime: range.start.toISOString(),
				endDateTime: range.end.toISOString(),
			});
			const events = await list(
				connection,
				`${path(connection.calendarId)}/calendarView?${query}`,
			);
			return events.flatMap((item) => {
				const event = z
					.object({
						id: z.string(),
						isCancelled: z.boolean().optional(),
						showAs: z.string(),
						start: z.object({
							dateTime: z.string(),
							timeZone: z.literal("UTC"),
						}),
						end: z.object({ dateTime: z.string(), timeZone: z.literal("UTC") }),
					})
					.parse(item);
				if (
					excluded.includes(event.id) ||
					event.isCancelled ||
					event.showAs === "free"
				)
					return [];
				const date = (value: string) =>
					absolute(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
				return [
					{ start: date(event.start.dateTime), end: date(event.end.dateTime) },
				];
			});
		},
		async ensureEvent(connection, input) {
			const id = await find(connection, input);
			const body = {
				subject: input.booking.eventName,
				start: { dateTime: input.booking.start, timeZone: "UTC" },
				end: { dateTime: input.booking.end, timeZone: "UTC" },
			};
			if (id) {
				await request(
					connection,
					`${path(input.calendarId)}/events/${encodeURIComponent(id)}`,
					"PATCH",
					body,
				);
				return { eventId: id };
			}
			const created = await request(
				connection,
				`${path(input.calendarId)}/events`,
				"POST",
				{
					...body,
					transactionId: await stableId(input.syncKey),
					singleValueExtendedProperties: [
						{ id: syncProperty, value: input.syncKey },
					],
				},
			);
			return { eventId: eventIdSchema.parse(await created.json()).id };
		},
		async deleteEvent(connection, input) {
			const id = await find(connection, input);
			if (id)
				await request(
					connection,
					`${path(input.calendarId)}/events/${encodeURIComponent(id)}`,
					"DELETE",
					undefined,
					[404, 410],
				);
		},
	};
}
