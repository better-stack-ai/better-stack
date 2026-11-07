import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { createServerAuth } from "@btst/stack/authorization/server";
import { defineAuthorization } from "@btst/stack/authorization";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { calendarBackendPlugin } from "../api";
import type { CalendarBackendConfig } from "../api";
import type { CalendarProviderAdapter } from "../api/providers";
import { calendarPermissions } from "../permissions";
import type { Booking } from "../types";

const eventInput = {
	hostId: "host",
	slug: "provider-consultation",
	name: "Provider consultation",
	duration: 30,
	timezone: "UTC",
	weeklyAvailability: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
};
const bookingInput = {
	slug: eventInput.slug,
	start: "2030-01-07T09:00:00Z",
	timezone: "UTC",
	name: "Guest",
	email: "guest@example.com",
};

function providerFixture() {
	const events = new Map<string, { eventId: string; booking: Booking }>();
	let timeoutAfterCreate = false;
	const provider = {
		connect: vi.fn(async () => ({
			accountId: "private-provider-account",
			label: "Host calendar account",
		})),
		disconnect: vi.fn(async () => {}),
		listCalendars: vi.fn(async () => [
			{ id: "appointments", name: "Appointments" },
		]),
		getBusyIntervals: vi.fn(async () => []),
		ensureEvent: vi.fn(async (_connection, input) => {
			const event = {
				eventId:
					events.get(input.syncKey)?.eventId ?? `external-${events.size + 1}`,
				booking: input.booking,
			};
			events.set(input.syncKey, event);
			if (timeoutAfterCreate) {
				timeoutAfterCreate = false;
				throw new Error("Timeout containing secret-access-token");
			}
			return { eventId: event.eventId };
		}),
		deleteEvent: vi.fn(async (_connection, input) => {
			events.delete(input.syncKey);
		}),
	} satisfies CalendarProviderAdapter;
	return {
		provider,
		events,
		timeout: () => {
			timeoutAfterCreate = true;
		},
	};
}

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [calendarPermissions] as const,
	rules: ({ calendar }) => [
		calendar.connection.list.when(
			({ identity, facts }) =>
				identity !== null && (!facts.hostId || identity.id === facts.hostId),
		),
		calendar.connection.connect.when(
			({ identity, facts }) =>
				identity !== null && (!facts.hostId || identity.id === facts.hostId),
		),
		calendar.connection.manage.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		calendar.sync.retry.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
	],
});

function setup(options: CalendarBackendConfig = {}) {
	const stack = createBackendStack({
		basePath: "/api/data",
		plugins: { calendar: calendarBackendPlugin(options) },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-host");
				return id ? { id } : null;
			},
		}),
	});
	return {
		stack,
		calendar: stack.trusted.calendar,
		request: (path: string, method = "GET", body?: unknown, host?: string) =>
			stack.handler(
				new Request(`http://localhost/api/data${path}`, {
					method,
					headers: {
						...(host ? { "x-host": host } : {}),
						...(body ? { "content-type": "application/json" } : {}),
					},
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			),
	};
}

async function connect(calendar: ReturnType<typeof setup>["calendar"]) {
	const connection = await calendar.connectCalendarProvider({
		provider: "google",
		hostId: "host",
	});
	await calendar.selectProviderCalendar({
		id: connection.id,
		calendarId: "appointments",
	});
	return connection;
}

async function createEvent(
	calendar: ReturnType<typeof setup>["calendar"],
	paid = false,
) {
	return calendar.createEventType({
		...eventInput,
		...(paid ? { price: 2500, currency: "USD" } : {}),
	});
}

describe("Calendar provider boundary", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("mirrors confirmed create, reschedule and cancellation using one persisted event mapping", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		await connect(calendar);
		await createEvent(calendar);
		const booking = await calendar.createBooking(bookingInput);
		expect(fixture.events.size).toBe(1);
		const first = [...fixture.events.values()][0]!;
		await calendar.rescheduleBooking({
			token: booking.cancelToken,
			start: "2030-01-07T09:30:00Z",
			timezone: "UTC",
		});
		expect(fixture.events.size).toBe(1);
		expect([...fixture.events.values()][0]).toMatchObject({
			eventId: first.eventId,
			booking: { start: "2030-01-07T09:30:00.000Z" },
		});
		await calendar.cancelBooking({ token: booking.cancelToken });
		expect(fixture.events.size).toBe(0);
		expect(fixture.provider.deleteEvent).toHaveBeenCalledTimes(1);
		await calendar.cancelBooking({ token: booking.cancelToken });
		expect(fixture.events.size).toBe(0);
	});

	it("does not mirror a pending payment before trusted confirmation", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		await connect(calendar);
		await createEvent(calendar, true);
		const booking = await calendar.createBooking(bookingInput);
		expect(booking.status).toBe("pending_payment");
		expect(fixture.provider.ensureEvent).not.toHaveBeenCalled();
		await calendar.confirmBookingPayment({ id: booking.id });
		await calendar.confirmBookingPayment({ id: booking.id });
		expect(fixture.events.size).toBe(1);
	});

	it("persists a redacted failure after an ambiguous create and reconciles retries without duplicates", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		await connect(calendar);
		await createEvent(calendar);
		fixture.timeout();
		const booking = await calendar.createBooking(bookingInput);
		expect(booking.status).toBe("confirmed");
		const failed = await calendar.listCalendarConnections({ hostId: "host" });
		expect(failed.sync).toHaveLength(1);
		expect(failed.sync[0]).toMatchObject({
			bookingId: booking.id,
			state: "failed",
			attempts: 1,
		});
		expect(JSON.stringify(failed)).not.toContain("secret-access-token");
		expect(JSON.stringify(failed)).not.toContain("private-provider-account");
		await calendar.retryCalendarSync({ id: failed.sync[0]!.id });
		await calendar.retryCalendarSync({ id: failed.sync[0]!.id });
		expect(fixture.events.size).toBe(1);
		const recovered = await calendar.listCalendarConnections({
			hostId: "host",
		});
		expect(recovered.sync[0]).toMatchObject({
			state: "synced",
			eventId: "external-1",
			error: null,
		});
	});

	it("fails closed on provider errors and invalid intervals on both reads and reservations", async () => {
		const fixture = providerFixture();
		const callback = vi.fn(async () => []);
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
			getBusyIntervals: callback,
		});
		await connect(calendar);
		await createEvent(calendar);
		fixture.provider.getBusyIntervals.mockRejectedValue(
			new Error("Provider unavailable"),
		);
		await expect(
			calendar.getAvailability({
				slug: eventInput.slug,
				date: "2030-01-07",
				timezone: "UTC",
			}),
		).rejects.toThrow();
		await expect(calendar.createBooking(bookingInput)).rejects.toThrow();
		fixture.provider.getBusyIntervals.mockResolvedValue([
			{
				start: new Date("2030-01-07T10:00:00Z"),
				end: new Date("2030-01-07T09:00:00Z"),
			},
		] as never);
		await expect(
			calendar.getAvailability({
				slug: eventInput.slug,
				date: "2030-01-07",
				timezone: "UTC",
			}),
		).rejects.toThrow();
		expect(fixture.events.size).toBe(0);
	});

	it("combines provider busy instants with the existing callback and keeps standalone behavior", async () => {
		const fixture = providerFixture();
		fixture.provider.getBusyIntervals.mockResolvedValue([
			{
				start: new Date("2030-01-07T09:00:00Z"),
				end: new Date("2030-01-07T09:30:00Z"),
			},
		] as never);
		const getBusyIntervals = vi.fn(async () => [
			{
				start: new Date("2030-01-07T09:30:00Z"),
				end: new Date("2030-01-07T10:00:00Z"),
			},
		]);
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
			getBusyIntervals,
		});
		await connect(calendar);
		await createEvent(calendar);
		const result = await calendar.getAvailability({
			slug: eventInput.slug,
			date: "2030-01-07",
			timezone: "UTC",
		});
		expect(result.slots[0]?.start).toBe("2030-01-07T10:00:00.000Z");
		expect(getBusyIntervals).toHaveBeenCalled();
		const standalone = setup().calendar;
		await createEvent(standalone);
		expect(
			(
				await standalone.getAvailability({
					slug: eventInput.slug,
					date: "2030-01-07",
					timezone: "UTC",
				})
			).slots[0]?.start,
		).toBe("2030-01-07T09:00:00.000Z");
		expect(
			await standalone.listCalendarConnections({ hostId: "host" }),
		).toMatchObject({ providers: [], connections: [], sync: [] });
	});
	it("protects connection and sync ownership and excludes private account data from HTTP responses", async () => {
		const fixture = providerFixture();
		const { calendar, request } = setup({
			calendarProviders: { google: fixture.provider },
		});
		const connection = await connect(calendar);
		await createEvent(calendar);
		await calendar.createBooking(bookingInput);
		const state = await calendar.listCalendarConnections({ hostId: "host" });
		expect((await request("/calendar/connections")).status).toBe(401);
		const own = await request(
			"/calendar/connections",
			"GET",
			undefined,
			"host",
		);
		expect(own.status).toBe(200);
		expect(await own.text()).not.toContain("private-provider-account");
		const other = await request(
			"/calendar/connections",
			"GET",
			undefined,
			"other",
		);
		expect(await other.json()).toMatchObject({ connections: [], sync: [] });
		for (const [path, method, body] of [
			[`/calendar/connections/${connection.id}/calendars`, "GET", undefined],
			[
				`/calendar/connections/${connection.id}`,
				"PATCH",
				{ calendarId: "appointments" },
			],
			[`/calendar/connections/${connection.id}`, "DELETE", undefined],
			[`/calendar/sync/${state.sync[0]!.id}/retry`, "POST", {}],
		] as const) {
			expect((await request(path, method, body, "other")).status).toBe(403);
		}
	});

	it("blocks unchecked availability before selection and revokes the app connection on disconnect", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		const connection = await calendar.connectCalendarProvider({
			provider: "google",
			hostId: "host",
		});
		await createEvent(calendar);
		await expect(
			calendar.getAvailability({
				slug: eventInput.slug,
				date: "2030-01-07",
				timezone: "UTC",
			}),
		).rejects.toThrow();
		await calendar.disconnectCalendarProvider({ id: connection.id });
		expect(fixture.provider.disconnect).toHaveBeenCalledTimes(1);
		expect(
			(
				await calendar.getAvailability({
					slug: eventInput.slug,
					date: "2030-01-07",
					timezone: "UTC",
				})
			).slots,
		).not.toHaveLength(0);
	});
	it("cleans external mappings on disconnect and uses a fresh key when reconnecting an active booking", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		const connection = await connect(calendar);
		await createEvent(calendar);
		const booking = await calendar.createBooking(bookingInput);
		const firstKey = fixture.provider.ensureEvent.mock.calls[0]![1].syncKey;
		await calendar.disconnectCalendarProvider({ id: connection.id });
		expect(fixture.events.size).toBe(0);
		expect(
			(await calendar.listCalendarConnections({ hostId: "host" })).sync,
		).toEqual([]);
		await connect(calendar);
		expect(fixture.events.size).toBe(1);
		const latestKey =
			fixture.provider.ensureEvent.mock.calls.at(-1)![1].syncKey;
		expect(latestKey).not.toBe(firstKey);
		expect(
			await calendar.getBooking({ token: booking.cancelToken }),
		).toMatchObject({ id: booking.id, status: "confirmed" });
	});

	it("retries revocation after its effect without requiring revoked credentials for event cleanup", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		const connection = await connect(calendar);
		await createEvent(calendar);
		const booking = await calendar.createBooking(bookingInput);
		let revoked = false;
		fixture.provider.deleteEvent.mockImplementation(
			async (_connection, input) => {
				if (revoked) throw new Error("Credentials have already been revoked");
				fixture.events.delete(input.syncKey);
			},
		);
		fixture.provider.disconnect.mockImplementation(async () => {
			if (!revoked) {
				revoked = true;
				throw new Error("Revocation succeeded but its response timed out");
			}
		});
		await expect(
			calendar.disconnectCalendarProvider({ id: connection.id }),
		).rejects.toThrow();
		expect(fixture.events.size).toBe(0);
		expect(
			(await calendar.listCalendarConnections({ hostId: "host" }))
				.connections[0],
		).toMatchObject({ status: "disconnecting" });
		await expect(
			calendar.getAvailability({
				slug: eventInput.slug,
				date: "2030-01-07",
				timezone: "UTC",
			}),
		).rejects.toThrow();
		await expect(
			calendar.connectCalendarProvider({ provider: "google", hostId: "host" }),
		).rejects.toThrow();
		await expect(
			calendar.selectProviderCalendar({
				id: connection.id,
				calendarId: "appointments",
			}),
		).rejects.toThrow();
		await calendar.disconnectCalendarProvider({ id: connection.id });
		expect(fixture.provider.deleteEvent).toHaveBeenCalledTimes(1);
		expect(fixture.provider.disconnect).toHaveBeenCalledTimes(2);
		expect(
			await calendar.listCalendarConnections({ hostId: "host" }),
		).toMatchObject({ connections: [{ status: "disconnected" }], sync: [] });
		expect(
			await calendar.getBooking({ token: booking.cancelToken }),
		).toMatchObject({ status: "confirmed" });
	});

	it("serializes concurrent disconnect retries before allowing a new connection", async () => {
		const fixture = providerFixture();
		const { calendar } = setup({
			calendarProviders: { google: fixture.provider },
		});
		const connection = await connect(calendar);
		let release!: () => void;
		let entered!: () => void;
		const revocationStarted = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const continueRevocation = new Promise<void>((resolve) => {
			release = resolve;
		});
		fixture.provider.disconnect.mockImplementation(async () => {
			entered();
			await continueRevocation;
		});
		const first = calendar.disconnectCalendarProvider({ id: connection.id });
		await revocationStarted;
		const second = calendar.disconnectCalendarProvider({ id: connection.id });
		release();
		await Promise.all([first, second]);
		expect(fixture.provider.disconnect).toHaveBeenCalledTimes(1);
		await connect(calendar);
		expect(
			(await calendar.listCalendarConnections({ hostId: "host" }))
				.connections[0],
		).toMatchObject({ status: "connected" });
	});

	it("does not treat an active persisted connection as disconnected when its adapter is removed", async () => {
		const fixture = providerFixture();
		const providers: CalendarBackendConfig["calendarProviders"] = {
			google: fixture.provider,
		};
		const { calendar } = setup({ calendarProviders: providers });
		await connect(calendar);
		await createEvent(calendar);
		const booking = await calendar.createBooking(bookingInput);
		providers.google = undefined;
		await expect(
			calendar.getAvailability({
				slug: eventInput.slug,
				date: "2030-01-07",
				timezone: "UTC",
			}),
		).rejects.toThrow();
		await expect(calendar.createBooking(bookingInput)).rejects.toThrow();
		expect(
			await calendar.cancelBooking({ token: booking.cancelToken }),
		).toMatchObject({ status: "cancelled" });
		expect(
			(await calendar.listCalendarConnections({ hostId: "host" })).sync[0],
		).toMatchObject({ state: "failed" });
	});
});
