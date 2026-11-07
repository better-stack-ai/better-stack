import { afterEach, describe, expect, it, vi } from "vitest";
import {
	googleCalendarAdapter,
	microsoftCalendarAdapter,
} from "../api/provider-adapters";
import type { CalendarProviderConnection } from "../api/providers";
import type { Booking } from "../types";

const connection: CalendarProviderConnection = {
	id: "connection",
	hostId: "host",
	provider: "google",
	accountId: "private-account",
	label: "Work",
	calendarId: "calendar",
	calendarName: "Work",
	status: "connected",
};
const booking = {
	id: "booking",
	eventName: "Consultation",
	start: "2030-03-10T14:00:00.000Z",
	end: "2030-03-10T14:30:00.000Z",
} as Booking;
const input = {
	calendarId: "calendar",
	syncKey: "connection:booking",
	eventId: null,
	booking,
};
const range = {
	start: new Date("2030-03-09T00:00:00Z"),
	end: new Date("2030-03-12T00:00:00Z"),
};
const credentials = {
	connect: vi.fn(async () => ({ accountId: "private-account", label: "Work" })),
	disconnect: vi.fn(async () => {}),
	getAccessToken: vi.fn(async () => "server-only-token"),
};
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("calendar HTTP adapters", () => {
	it("reconciles a Google create timeout by deterministic ID before retrying", async () => {
		let saved: Record<string, unknown> | undefined;
		let creates = 0;
		const fetch = vi.fn(async (_url: URL, options: RequestInit) => {
			if (options.method === "GET") return saved ? json(saved) : json({}, 404);
			if (options.method === "POST") {
				creates++;
				saved = JSON.parse(options.body as string);
				throw new Error("response timed out after commit");
			}
			return json(saved);
		});
		vi.stubGlobal("fetch", fetch);
		const adapter = googleCalendarAdapter(credentials);
		await expect(adapter.ensureEvent(connection, input)).rejects.toThrow(
			"timed out",
		);
		const result = await adapter.ensureEvent(connection, input);
		expect(creates).toBe(1);
		expect(result.eventId).toMatch(/^[0-9a-f]{64}$/);
		expect(fetch.mock.calls.map((call) => call[1].method)).toEqual([
			"GET",
			"POST",
			"GET",
			"PATCH",
		]);
	});

	it("reads every Google busy page, excludes mirrored events and resolves all-day DST instants", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				json({
					timeZone: "America/New_York",
					nextPageToken: "page2",
					items: [
						{
							id: "mirrored",
							start: { dateTime: booking.start },
							end: { dateTime: booking.end },
						},
						{ id: "free", transparency: "transparent" },
					],
				}),
			)
			.mockResolvedValueOnce(
				json({
					timeZone: "America/New_York",
					items: [
						{
							id: "all-day",
							start: { date: "2030-03-10" },
							end: { date: "2030-03-11" },
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetch);
		const busy = await googleCalendarAdapter(credentials).getBusyIntervals(
			connection,
			range,
			["mirrored"],
		);
		expect(busy).toEqual([
			{
				start: new Date("2030-03-10T05:00:00Z"),
				end: new Date("2030-03-11T04:00:00Z"),
			},
		]);
		expect(String(fetch.mock.calls[1]![0])).toContain("pageToken=page2");
	});

	it("does not overwrite or recreate a Google event deleted externally", async () => {
		const fetch = vi.fn(async () => json({}, 404));
		vi.stubGlobal("fetch", fetch);
		await expect(
			googleCalendarAdapter(credentials).ensureEvent(connection, {
				...input,
				eventId: "removed",
			}),
		).rejects.toThrow("removed");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("reconciles Microsoft creates using the persisted marker after an ambiguous timeout", async () => {
		let saved: Record<string, unknown> | undefined;
		let creates = 0;
		const fetch = vi.fn(async (_url: URL, options: RequestInit) => {
			if (options.method === "GET")
				return json({ value: saved ? [{ id: "external" }] : [] });
			if (options.method === "POST") {
				creates++;
				saved = JSON.parse(options.body as string);
				throw new Error("timeout after provider created event");
			}
			return json({ id: "external" });
		});
		vi.stubGlobal("fetch", fetch);
		const adapter = microsoftCalendarAdapter(credentials);
		await expect(adapter.ensureEvent(connection, input)).rejects.toThrow(
			"timeout",
		);
		await expect(adapter.ensureEvent(connection, input)).resolves.toEqual({
			eventId: "external",
		});
		expect(creates).toBe(1);
		expect(saved).toMatchObject({
			transactionId: expect.stringMatching(/^[0-9a-f]{64}$/),
			singleValueExtendedProperties: [
				{ value: input.syncKey, id: expect.any(String) },
			],
		});
	});

	it("reads Microsoft UTC busy events and follows pagination without leaking credentials", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(
				json({
					value: [
						{
							id: "mapped",
							showAs: "busy",
							start: { dateTime: "2030-03-10T14:00:00", timeZone: "UTC" },
							end: { dateTime: "2030-03-10T14:30:00", timeZone: "UTC" },
						},
					],
					"@odata.nextLink":
						"https://graph.microsoft.com/v1.0/me/calendars/calendar/calendarView?$skip=1",
				}),
			)
			.mockResolvedValueOnce(
				json({
					value: [
						{
							id: "busy",
							showAs: "tentative",
							start: {
								dateTime: "2030-03-10T15:00:00.0000000",
								timeZone: "UTC",
							},
							end: { dateTime: "2030-03-10T16:00:00.0000000", timeZone: "UTC" },
						},
					],
				}),
			);
		vi.stubGlobal("fetch", fetch);
		await expect(
			microsoftCalendarAdapter(credentials).getBusyIntervals(
				connection,
				range,
				["mapped"],
			),
		).resolves.toEqual([
			{
				start: new Date("2030-03-10T15:00:00Z"),
				end: new Date("2030-03-10T16:00:00Z"),
			},
		]);
		expect(credentials.getAccessToken).toHaveBeenCalledTimes(2);
	});

	it("rejects Microsoft cross-origin pagination before forwarding a token", async () => {
		const fetch = vi.fn(async () =>
			json({ value: [], "@odata.nextLink": "https://attacker.example/steal" }),
		);
		vi.stubGlobal("fetch", fetch);
		await expect(
			microsoftCalendarAdapter(credentials).listCalendars(connection),
		).rejects.toThrow("pagination URL");
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(credentials.getAccessToken).toHaveBeenCalledTimes(1);
	});

	it.each([googleCalendarAdapter, microsoftCalendarAdapter])(
		"fails closed on HTTP errors without reflecting provider secrets",
		async (factory) => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => json({ error: "server-only-token" }, 401)),
			);
			await expect(
				factory(credentials).getBusyIntervals(connection, range, []),
			).rejects.toThrow("Calendar provider request failed (401)");
		},
	);
});
