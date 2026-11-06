import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as calendar from "@btst/plugin-calendar/api";
import * as permissions from "@btst/plugin-calendar/permissions";
import * as queries from "@btst/plugin-calendar/query-keys";
import { calendarClientPlugin } from "@btst/plugin-calendar/client";
import { createClientStack } from "@btst/stack/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
const require = createRequire(import.meta.url);
assert.equal(calendarClientPlugin().id, "calendar");
assert.equal(
	require("@btst/plugin-calendar/client").calendarClientPlugin().id,
	"calendar",
);
for (const absent of ["ai-chat", "blog", "newsletter", "cms"]) {
	assert.throws(() => require.resolve(`@btst/plugin-${absent}/api`), {
		code: "MODULE_NOT_FOUND",
	});
}
assert.throws(() => require.resolve("@btst/components/markdown"), {
	code: "MODULE_NOT_FOUND",
});
const eventInput = {
	slug: "consultation",
	name: "Consultation",
	duration: 30,
	capacity: 1,
	timezone: "America/New_York",
	weeklyAvailability: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
};
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	calendarBackendPlugin,
	calendarPermissions,
	createCalendarQueryKeys,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [calendarPermissions],
		rules: ({ calendar: c }) => [
			c.eventType.list.when(({ identity }) => identity !== null),
			c.eventType.create.when(({ identity }) => identity !== null),
			c.eventType.read.when(
				({ identity, facts }) => facts.public || identity?.id === facts.hostId,
			),
			c.eventType.update.when(
				({ identity, facts }) => identity?.id === facts.hostId,
			),
			c.eventType.delete.when(
				({ identity, facts }) => identity?.id === facts.hostId,
			),
			c.availability.read.allow(),
			c.booking.create.allow(),
			c.booking.list.when(({ identity }) => identity !== null),
			c.booking.read.when(
				({ identity, facts }) =>
					facts.tokenValid || identity?.id === facts.hostId,
			),
			c.booking.cancel.when(
				({ identity, facts }) =>
					facts.tokenValid || identity?.id === facts.hostId,
			),
			c.booking.remind.when(
				({ identity, facts }) => identity?.id === facts.hostId,
			),
		],
	});
	let adapter;
	let confirmed = 0,
		cancelled = 0;
	const stack = createBackendStack({
		basePath: "/api",
		plugins: {
			calendar: calendarBackendPlugin({
				hooks: {
					onAfterConfirmBooking: () => {
						confirmed++;
					},
					onAfterCancelBooking: () => {
						cancelled++;
					},
				},
			}),
		},
		adapter: (db) => (adapter = createMemoryAdapter(db)({})),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-host");
				return id ? { id } : null;
			},
		}),
	});
	const request = (path, method = "GET", body, host) =>
		stack.handler(
			new Request(`https://example.test/api/calendar/${path}`, {
				method,
				headers: {
					...(host ? { "x-host": host } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	assert.equal((await request("events")).status, 401);
	assert.equal(
		(
			await request(
				"events",
				"POST",
				{ ...eventInput, timezone: "Invalid/Timezone" },
				"host",
			)
		).status,
		400,
	);
	const created = await request(
		"events",
		"POST",
		{ ...eventInput, hostId: "victim" },
		"host",
	);
	assert.equal(created.status, 200);
	const event = await created.json();
	assert.equal(event.hostId, "host");
	assert.equal(
		(await request(`events/${event.id}`, "GET", undefined, "other")).status,
		403,
	);
	assert.equal(
		(
			await request(
				`events/${event.id}`,
				"PATCH",
				{ ...eventInput, name: "Hijacked" },
				"other",
			)
		).status,
		403,
	);
	assert.deepEqual(
		await (await request("events", "GET", undefined, "other")).json(),
		[],
	);
	const availability = await (
		await request(
			"book/consultation/slots?date=2035-01-01&timezone=America%2FNew_York",
		)
	).json();
	assert.deepEqual(availability.slots[0], {
		start: "2035-01-01T14:00:00.000Z",
		end: "2035-01-01T14:30:00.000Z",
		remaining: 1,
	});
	const guest = {
		start: availability.slots[0].start,
		timezone: "America/New_York",
		name: "Guest",
		email: "GUEST@example.test",
	};
	const bookings = await Promise.all([
		request("book/consultation", "POST", guest),
		request("book/consultation", "POST", {
			...guest,
			email: "other@example.test",
		}),
	]);
	assert.deepEqual(bookings.map((r) => r.status).sort(), [200, 409]);
	const booked = await bookings.find((r) => r.status === 200).json();
	assert.equal(booked.hostId, "host");
	assert.ok(booked.cancelToken.length >= 32);
	assert.equal(confirmed, 1);
	const managed = await (
		await request("bookings?period=all", "GET", undefined, "host")
	).json();
	assert.equal(managed.length, 1);
	assert.equal(managed[0].cancelToken, "");
	assert.equal(
		(await request(`bookings/${booked.id}/cancel`, "POST", undefined, "other"))
			.status,
		403,
	);
	assert.equal((await request("cancel/incorrect-token")).status, 404);
	assert.equal(
		(await (await request(`cancel/${booked.cancelToken}`)).json()).id,
		booked.id,
	);
	for (let i = 0; i < 2; i++)
		assert.equal(
			(await (await request(`cancel/${booked.cancelToken}`, "POST")).json())
				.status,
			"cancelled",
		);
	assert.equal(cancelled, 1);
	const reopened = await (
		await request("book/consultation/slots?date=2035-01-01&timezone=UTC")
	).json();
	assert.equal(reopened.slots[0].remaining, 1);
	assert.doesNotMatch(
		JSON.stringify(reopened),
		/cancelToken|Guest|example.test/,
	);
	// Literal persisted v5 records retain their table and JSON/date representation.
	await adapter.create({
		model: "calendarEventType",
		forceAllowId: true,
		data: {
			id: "v5-event",
			hostId: "legacy-host",
			slug: "legacy-consultation",
			name: "Existing consultation",
			description: "Saved before extraction",
			location: "Office",
			duration: 45,
			capacity: 2,
			timezone: "UTC",
			weeklyAvailability: '[{"dayOfWeek":1,"start":"09:00","end":"12:00"}]',
			dateOverrides: "[]",
			limits: '{"total":20}',
			active: true,
			createdAt: new Date("2025-01-01T00:00:00Z"),
			updatedAt: new Date("2025-01-01T00:00:00Z"),
		},
	});
	await adapter.create({
		model: "calendarBooking",
		forceAllowId: true,
		data: {
			id: "v5-booking",
			eventTypeId: "v5-event",
			hostId: "legacy-host",
			eventName: "Existing consultation",
			start: new Date("2035-01-01T09:00:00Z"),
			end: new Date("2035-01-01T09:45:00Z"),
			timezone: "UTC",
			name: "Existing attendee",
			email: "old@example.test",
			status: "confirmed",
			cancelToken: "legacy-private-token",
			createdAt: new Date("2025-01-01T00:00:00Z"),
		},
	});
	const legacy = await (await request("book/legacy-consultation")).json();
	assert.equal(legacy.id, "v5-event");
	assert.deepEqual(legacy.limits, { total: 20 });
	assert.equal(legacy.createdAt, "2025-01-01T00:00:00.000Z");
	const oldBooking = await (
		await request("cancel/legacy-private-token")
	).json();
	assert.equal(oldBooking.id, "v5-booking");
	assert.equal(oldBooking.start, "2035-01-01T09:00:00.000Z");
	const apiClient = { get: async () => ({}) };
	const keys = createCalendarQueryKeys(apiClient);
	assert.notDeepEqual(
		keys.calendarEvents.list({ id: "host" }).queryKey,
		keys.calendarEvents.list({ id: "other" }).queryKey,
	);
	assert.notDeepEqual(
		keys.calendarEvents.list("pending:1").queryKey,
		keys.calendarEvents.list("pending:2").queryKey,
	);
	return { stack, event };
}
const { stack, event } = await verify({
	...core,
	...auth,
	...server,
	...calendar,
	...permissions,
	...queries,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-calendar/api"),
	...require("@btst/plugin-calendar/permissions"),
	...require("@btst/plugin-calendar/query-keys"),
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => stack.handler(new Request(input, init));
try {
	const queryClient = new QueryClient();
	const identity = { id: "host" };
	const clientStack = createClientStack({
		api: {
			baseURL: "https://example.test",
			basePath: "/api",
			headers: { "x-host": "host" },
		},
		site: { baseURL: "https://example.test", basePath: "/pages" },
		queryClient,
		plugins: {
			calendar: calendarClientPlugin({ identityPartition: identity }),
		},
	});
	const dashboard = clientStack.router.getRoute("/calendar");
	assert.ok(dashboard?.loader);
	await dashboard.loader();
	assert.equal(
		queryClient.getQueryData(
			queries
				.createCalendarQueryKeys({ get: async () => ({}) })
				.calendarEvents.list(identity).queryKey,
		)[0].id,
		event.id,
	);
	const publicBooking = clientStack.router.getRoute(
		"/calendar/book/legacy-consultation",
	);
	assert.ok(publicBooking?.loader);
	await publicBooking.loader();
	assert.equal(publicBooking.meta()[0].title, "Existing consultation");
} finally {
	globalThis.fetch = originalFetch;
}
console.log(
	"Calendar ESM/CommonJS operations, authorization, timezone slots, capacity, token cancellation, v5 data, query identity and SSR passed",
);
