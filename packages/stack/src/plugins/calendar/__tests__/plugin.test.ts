import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { calendarBackendPlugin, type CalendarBackendHooks } from "../api";
import { calendarPermissions } from "../permissions";
import type { Booking, EventType } from "../types";

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [calendarPermissions] as const,
	rules: ({ calendar }) => [
		calendar.eventType.list.when(({ identity }) => identity !== null),
		calendar.eventType.create.when(({ identity }) => identity !== null),
		calendar.eventType.read.when(
			({ identity, facts }) => facts.public || identity?.id === facts.hostId,
		),
		calendar.eventType.update.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		calendar.eventType.delete.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		calendar.availability.read.when(() => true),
		calendar.booking.create.when(() => true),
		calendar.booking.list.when(({ identity }) => identity !== null),
		calendar.booking.read.when(
			({ identity, facts }) =>
				facts.tokenValid || identity?.id === facts.hostId,
		),
		calendar.booking.cancel.when(
			({ identity, facts }) =>
				facts.tokenValid || identity?.id === facts.hostId,
		),
		calendar.booking.remind.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
	],
});

function setup(hooks?: CalendarBackendHooks) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api/data",
		plugins: { calendar: calendarBackendPlugin({ hooks }) },
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-host");
				return id ? { id } : null;
			},
		}),
	});
	async function request(
		path: string,
		method = "GET",
		body?: unknown,
		host?: string,
	) {
		return stack.handler(
			new Request(`http://localhost/api/data${path}`, {
				method,
				headers: {
					...(body ? { "content-type": "application/json" } : {}),
					...(host ? { "x-host": host } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	}
	return {
		stack,
		request,
		get adapter() {
			return adapter;
		},
	};
}

const eventInput = {
	slug: "consultation",
	name: "Consultation",
	duration: 30,
	timezone: "UTC",
	weeklyAvailability: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
};

const attendee = (
	start = "2030-01-07T09:00:00Z",
	email = "guest@example.com",
) => ({ start, email, name: "Guest", timezone: "UTC" });

describe("Calendar API", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("scopes management to request identity and protects event CRUD", async () => {
		const { request } = setup();
		expect((await request("/calendar/events")).status).toBe(401);
		const created = await request(
			"/calendar/events",
			"POST",
			{ ...eventInput, hostId: "other" },
			"host",
		);
		expect(created.status).toBe(200);
		const event = (await created.json()) as EventType;
		expect(event.hostId).toBe("host");
		expect(
			(await request(`/calendar/events/${event.id}`, "GET", undefined, "other"))
				.status,
		).toBe(403);
		expect(
			(
				await request(
					`/calendar/events/${event.id}`,
					"PATCH",
					{ ...eventInput, name: "Edited" },
					"other",
				)
			).status,
		).toBe(403);
		const updated = await request(
			`/calendar/events/${event.id}`,
			"PATCH",
			{ ...eventInput, name: "Edited" },
			"host",
		);
		expect((await updated.json()).name).toBe("Edited");
		expect(
			await (
				await request("/calendar/events", "GET", undefined, "other")
			).json(),
		).toEqual([]);
		expect(
			(
				await request(
					`/calendar/events/${event.id}`,
					"DELETE",
					undefined,
					"host",
				)
			).status,
		).toBe(200);
		expect((await request("/calendar/book/consultation")).status).toBe(404);
	});

	it("reserves one slot atomically across concurrent booking requests and event types", async () => {
		const { request } = setup();
		await request("/calendar/events", "POST", eventInput, "host");
		await request(
			"/calendar/events",
			"POST",
			{ ...eventInput, slug: "other-event" },
			"host",
		);
		const slots = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-01-07&timezone=America%2FNew_York",
			)
		).json();
		expect(slots.slots[0]).toEqual({
			start: "2030-01-07T09:00:00.000Z",
			end: "2030-01-07T09:30:00.000Z",
			remaining: 1,
		});
		const results = await Promise.all([
			request("/calendar/book/consultation", "POST", attendee()),
			request(
				"/calendar/book/other-event",
				"POST",
				attendee(undefined, "second@example.com"),
			),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
		const availability = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-01-07&timezone=UTC",
			)
		).json();
		expect(
			availability.slots.some(
				(slot: { start: string }) => slot.start === "2030-01-07T09:00:00.000Z",
			),
		).toBe(false);
		expect(JSON.stringify(availability)).not.toMatch(
			/guest@|cancelToken|Guest/,
		);
	});

	it("keeps public booking links unique when different hosts create them concurrently", async () => {
		const { request } = setup();
		const results = await Promise.all([
			request("/calendar/events", "POST", eventInput, "host-a"),
			request("/calendar/events", "POST", eventInput, "host-b"),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
	});

	it("enforces group capacity and daily limits, releases reservations on cancellation, and fires hooks once", async () => {
		const confirmed = vi.fn();
		const cancelled = vi.fn();
		const reminded = vi.fn();
		const { stack, request } = setup({
			onAfterConfirmBooking: confirmed,
			onAfterCancelBooking: cancelled,
			onAfterRemindBooking: reminded,
		});
		const event = (await (
			await request(
				"/calendar/events",
				"POST",
				{ ...eventInput, capacity: 3, limits: { perDay: 2 } },
				"host",
			)
		).json()) as EventType;
		const first = (await (
			await request("/calendar/book/consultation", "POST", attendee())
		).json()) as Booking;
		expect(
			(await request("/calendar/book/consultation", "POST", attendee())).status,
		).toBe(409);
		const results = await Promise.all([
			request(
				"/calendar/book/consultation",
				"POST",
				attendee(undefined, "second@example.com"),
			),
			request(
				"/calendar/book/consultation",
				"POST",
				attendee(undefined, "third@example.com"),
			),
		]);
		expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T10:00:00Z", "fourth@example.com"),
				)
			).status,
		).toBe(409);
		expect(
			(
				await request(
					`/calendar/events/${event.id}`,
					"DELETE",
					undefined,
					"host",
				)
			).status,
		).toBe(409);
		await stack.trusted.calendar.remindBooking({ id: first.id });
		expect(reminded).toHaveBeenCalledTimes(1);
		expect((await request(`/calendar/cancel/${first.id}`)).status).toBe(404);
		expect(
			(await request(`/calendar/cancel/${first.cancelToken}`)).status,
		).toBe(200);
		await request(`/calendar/cancel/${first.cancelToken}`, "POST");
		await request(`/calendar/cancel/${first.cancelToken}`, "POST");
		expect(cancelled).toHaveBeenCalledTimes(1);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T10:00:00Z", "fourth@example.com"),
				)
			).status,
		).toBe(200);
		expect(confirmed).toHaveBeenCalledTimes(3);
		await expect(
			stack.trusted.calendar.remindBooking({ id: first.id }),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it("enforces group capacity independently of limits and protects host cancellation and PII", async () => {
		const { request } = setup();
		await request(
			"/calendar/events",
			"POST",
			{ ...eventInput, capacity: 2 },
			"host",
		);
		const results = await Promise.all(
			["a", "b", "c"].map((name) =>
				request(
					"/calendar/book/consultation",
					"POST",
					attendee(undefined, `${name}@example.com`),
				),
			),
		);
		expect(results.map((result) => result.status).sort()).toEqual([
			200, 200, 409,
		]);
		const booking = (await results
			.find((result) => result.status === 200)!
			.json()) as Booking;
		expect((await request("/calendar/bookings")).status).toBe(401);
		expect(
			await (
				await request("/calendar/bookings", "GET", undefined, "other")
			).json(),
		).toEqual([]);
		const list = (await (
			await request("/calendar/bookings", "GET", undefined, "host")
		).json()) as Booking[];
		expect(list).toHaveLength(2);
		expect(list.every((item) => item.cancelToken === "")).toBe(true);
		expect(
			(
				await request(
					`/calendar/bookings/${booking.id}/cancel`,
					"POST",
					undefined,
					"other",
				)
			).status,
		).toBe(403);
		const cancelled = await request(
			`/calendar/bookings/${booking.id}/cancel`,
			"POST",
			undefined,
			"host",
		);
		expect(await cancelled.json()).toMatchObject({
			status: "cancelled",
			cancelToken: "",
		});
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee(undefined, "replacement@example.com"),
				)
			).status,
		).toBe(200);
	});

	it("applies date overrides in the host timezone and dates in the viewer timezone", async () => {
		const { request } = setup();
		await request(
			"/calendar/events",
			"POST",
			{
				...eventInput,
				timezone: "America/New_York",
				dateOverrides: [
					{ date: "2030-01-07", intervals: [] },
					{ date: "2030-01-08", intervals: [{ start: "18:00", end: "19:00" }] },
				],
			},
			"host",
		);
		const blocked = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-01-07&timezone=America%2FNew_York",
			)
		).json();
		expect(blocked.slots).toEqual([]);
		const viewer = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-01-09&timezone=Asia%2FTokyo",
			)
		).json();
		expect(viewer.slots).toEqual([
			{
				start: "2030-01-08T23:00:00.000Z",
				end: "2030-01-08T23:30:00.000Z",
				remaining: 1,
			},
			{
				start: "2030-01-08T23:30:00.000Z",
				end: "2030-01-09T00:00:00.000Z",
				remaining: 1,
			},
		]);
	});

	it("omits nonexistent spring times and keeps only fully available fall-back intervals", async () => {
		const { request } = setup();
		await request(
			"/calendar/events",
			"POST",
			{
				...eventInput,
				timezone: "America/New_York",
				weeklyAvailability: [],
				dateOverrides: [
					{ date: "2030-03-10", intervals: [{ start: "02:00", end: "03:00" }] },
					{ date: "2030-11-03", intervals: [{ start: "01:30", end: "02:00" }] },
				],
			},
			"host",
		);
		const spring = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-03-10&timezone=America%2FNew_York",
			)
		).json();
		expect(spring.slots).toEqual([]);
		const fall = await (
			await request(
				"/calendar/book/consultation/slots?date=2030-11-03&timezone=America%2FNew_York",
			)
		).json();
		expect(fall.slots.map((slot: { start: string }) => slot.start)).toEqual([
			"2030-11-03T05:30:00.000Z",
			"2030-11-03T06:30:00.000Z",
		]);
	});

	it("counts hour, week and total limits using confirmed attendee reservations", async () => {
		for (const limits of [{ perHour: 1 }, { perWeek: 1 }, { total: 1 }]) {
			const { request } = setup();
			await request(
				"/calendar/events",
				"POST",
				{ ...eventInput, limits },
				"host",
			);
			expect(
				(await request("/calendar/book/consultation", "POST", attendee()))
					.status,
			).toBe(200);
			expect(
				(
					await request(
						"/calendar/book/consultation",
						"POST",
						attendee("2030-01-07T09:30:00Z", "next@example.com"),
					)
				).status,
			).toBe(409);
		}
	});

	it("rejects invalid inputs, unavailable and past slots, and unpublished events", async () => {
		const { request } = setup();
		for (const input of [
			{ ...eventInput, timezone: "Mars/Olympus" },
			{
				...eventInput,
				weeklyAvailability: [{ dayOfWeek: 1, start: "12:00", end: "09:00" }],
			},
			{ ...eventInput, duration: 0 },
		]) {
			expect(
				(await request("/calendar/events", "POST", input, "host")).status,
			).toBe(400);
		}
		const event = (await (
			await request("/calendar/events", "POST", eventInput, "host")
		).json()) as EventType;
		expect(
			(
				await request(
					"/calendar/book/consultation/slots?date=2030-02-30&timezone=UTC",
				)
			).status,
		).toBe(400);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T09:01:00Z"),
				)
			).status,
		).toBe(409);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2029-12-31T09:00:00Z"),
				)
			).status,
		).toBe(409);
		await request(
			`/calendar/events/${event.id}`,
			"PATCH",
			{ ...eventInput, active: false },
			"host",
		);
		expect((await request("/calendar/book/consultation")).status).toBe(404);
		expect(
			(await request("/calendar/book/consultation", "POST", attendee())).status,
		).toBe(404);
	});

	it("counts every stored booking beyond adapter default pagination", async () => {
		const ctx = setup();
		const event = (await (
			await ctx.request(
				"/calendar/events",
				"POST",
				{ ...eventInput, limits: { total: 501 } },
				"host",
			)
		).json()) as EventType;
		await Promise.all(
			Array.from({ length: 501 }, (_, i) =>
				ctx.adapter.create({
					model: "calendarBooking",
					data: {
						eventTypeId: event.id,
						hostId: "host",
						eventName: event.name,
						start: new Date("2029-01-01T09:00:00Z"),
						end: new Date("2029-01-01T09:30:00Z"),
						timezone: "UTC",
						name: "Previous guest",
						email: `guest${i}@example.com`,
						status: "confirmed",
						cancelToken: crypto.randomUUID(),
						createdAt: new Date(),
					},
				}),
			),
		);
		const available = await (
			await ctx.request(
				"/calendar/book/consultation/slots?date=2030-01-07&timezone=UTC",
			)
		).json();
		expect(available.slots).toEqual([]);
		expect(
			(await ctx.request("/calendar/book/consultation", "POST", attendee()))
				.status,
		).toBe(409);
	});

	it("applies host-local hour, day, Monday-week and lifetime counts across viewer dates and cancellations", async () => {
		const { request } = setup();
		await request(
			"/calendar/events",
			"POST",
			{
				...eventInput,
				timezone: "America/New_York",
				capacity: 2,
				weeklyAvailability: [0, 1, 2].map((dayOfWeek) => ({
					dayOfWeek,
					start: "09:00",
					end: "12:00",
				})),
				limits: { perHour: 1, perDay: 2, perWeek: 3, total: 4 },
			},
			"host",
		);
		const sundayResponse = await request(
			"/calendar/book/consultation",
			"POST",
			attendee("2030-01-06T14:00:00Z"),
		);
		expect(sundayResponse.status).toBe(200);
		const sunday = (await sundayResponse.json()) as Booking;
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T14:00:00Z"),
				)
			).status,
		).toBe(200);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T14:30:00Z"),
				)
			).status,
		).toBe(409);
		const slotsForTokyoTuesday = async () =>
			(
				await (
					await request(
						"/calendar/book/consultation/slots?date=2030-01-08&timezone=Asia%2FTokyo",
					)
				).json()
			).slots as { start: string; remaining: number }[];
		expect((await slotsForTokyoTuesday())[0]).toMatchObject({
			start: "2030-01-07T15:00:00.000Z",
			remaining: 1,
		});
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T15:00:00Z"),
				)
			).status,
		).toBe(200);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-07T16:00:00Z"),
				)
			).status,
		).toBe(409);
		expect((await slotsForTokyoTuesday())[0]).toMatchObject({
			start: "2030-01-08T14:00:00.000Z",
			remaining: 1,
		});
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-08T14:00:00Z"),
				)
			).status,
		).toBe(200);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-08T15:00:00Z"),
				)
			).status,
		).toBe(409);
		expect(await slotsForTokyoTuesday()).toEqual([]);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-14T14:00:00Z"),
				)
			).status,
		).toBe(409);
		expect(
			(await request(`/calendar/cancel/${sunday.cancelToken}`, "POST")).status,
		).toBe(200);
		expect(
			(
				await request(
					"/calendar/book/consultation",
					"POST",
					attendee("2030-01-14T14:00:00Z"),
				)
			).status,
		).toBe(200);
	});

	it("fails closed when an adapter advertises transaction fallback", async () => {
		const ctx = setup();
		ctx.adapter.options!.adapterConfig.transaction = false;
		expect(
			(await ctx.request("/calendar/events", "POST", eventInput, "host"))
				.status,
		).toBe(503);
	});
});
