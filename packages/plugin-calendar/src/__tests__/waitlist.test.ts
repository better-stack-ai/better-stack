import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import type { PaymentWebhookResult } from "@btst/stack/payments";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { calendarBackendPlugin, type CalendarBackendConfig } from "../api";
import { calendarPermissions } from "../permissions";
import type { WaitlistEntry } from "../types";

const start = "2030-01-07T09:00:00.000Z";
const input = {
	slug: "group",
	name: "Group",
	duration: 30,
	capacity: 2,
	waitlistEnabled: true,
	timezone: "UTC",
	weeklyAvailability: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
};
const attendee = (email: string) => ({
	slug: "group",
	start,
	timezone: "UTC",
	name: "Guest",
	email,
});
function setup(config: CalendarBackendConfig = {}) {
	const verification: WaitlistEntry[] = [];
	const offers: WaitlistEntry[] = [];
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api/data",
		plugins: {
			calendar: calendarBackendPlugin({
				...config,
				hooks: {
					onWaitlistVerification: (entry) => {
						verification.push({ ...entry });
					},
					onWaitlistOffer: (entry) => {
						offers.push({ ...entry });
					},
					...config.hooks,
				},
			}),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization: defineAuthorization({
				identity: z.object({ id: z.string() }),
				permissions: [calendarPermissions] as const,
				rules: ({ calendar }) => [
					calendar.booking.create.when(() => true),
					calendar.booking.read.when(({ facts }) => facts.tokenValid),
					calendar.booking.cancel.when(({ facts }) => facts.tokenValid),
					calendar.availability.read.when(() => true),
				],
			}),
			getIdentity: () => null,
		}),
	});
	return {
		stack,
		verification,
		offers,
		get adapter() {
			return adapter;
		},
		ops: stack.trusted.calendar,
		request: (path: string, method = "GET", body?: unknown) =>
			stack.handler(
				new Request(`http://localhost/api/data${path}`, {
					method,
					...(body
						? {
								body: JSON.stringify(body),
								headers: { "content-type": "application/json" },
							}
						: {}),
				}),
			),
	};
}
async function full(config?: CalendarBackendConfig, extra = {}) {
	const app = setup(config);
	const event = await app.ops.createEventType({
		hostId: "host",
		...input,
		...extra,
	});
	const first = await app.ops.createBooking(attendee("first@example.com"));
	const second = await app.ops.createBooking(attendee("second@example.com"));
	return { ...app, event, first, second };
}
async function join(
	app: ReturnType<typeof setup>,
	email = "waiting@example.com",
) {
	await app.ops.joinWaitlist(attendee(email));
	return app.verification.at(-1)!;
}

describe("calendar verified slot waitlists", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("joins only full opt-in group slots, redacts the public response and rejects forged secrets", async () => {
		const app = await full();
		const response = await app.request(
			"/calendar/book/group/waitlist",
			"POST",
			attendee("WAITING@example.com"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(app.verification[0]?.email).toBe("waiting@example.com");
		expect(app.verification[0]?.status).toBe("unverified");
		for (const suffix of ["", "/verify", "/cancel", "/accept"])
			expect(
				(
					await app.request(
						`/calendar/waitlist/forged${suffix}`,
						suffix ? "POST" : "GET",
					)
				).status,
			).toBe(404);
		await expect(
			app.ops.joinWaitlist({
				...attendee("other@example.com"),
				start: "2030-01-07T10:00:00Z",
			}),
		).rejects.toThrow("Only full group slots");
		await app.ops.updateEventType({
			id: app.event.id,
			data: { ...input, waitlistEnabled: false },
		});
		await expect(
			app.ops.joinWaitlist(attendee("other@example.com")),
		).rejects.toThrow("Waitlist is unavailable");
	});

	it("deduplicates concurrent joins without exposing or replacing secrets and excludes booked attendees", async () => {
		const app = await full();
		await Promise.all([
			app.ops.joinWaitlist(attendee("waiting@example.com")),
			app.ops.joinWaitlist(attendee("WAITING@example.com")),
			app.ops.joinWaitlist(attendee("first@example.com")),
		]);
		expect(app.verification).toHaveLength(2);
		expect(new Set(app.verification.map((entry) => entry.token)).size).toBe(1);
		expect(await app.ops.listWaitlist({ hostId: "host" })).toEqual([
			expect.objectContaining({ token: "", email: "waiting@example.com" }),
		]);
		expect((await app.request("/calendar/waitlist")).status).toBe(401);
	});

	it("requires email verification before promotion and reserves released capacity ahead of direct booking", async () => {
		const app = await full();
		const unverified = await join(app, "unverified@example.com");
		const verified = await join(app, "verified@example.com");
		await app.ops.verifyWaitlistEntry({ token: verified.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		expect(app.offers).toHaveLength(1);
		expect(app.offers[0]?.id).toBe(verified.id);
		expect(
			(await app.ops.getWaitlistEntry({ token: unverified.token })).status,
		).toBe("unverified");
		await expect(
			app.ops.createBooking(attendee("direct@example.com")),
		).rejects.toThrow("no longer available");
		const [a, b] = await Promise.all([
			app.ops.acceptWaitlistOffer({ token: verified.token }),
			app.ops.acceptWaitlistOffer({ token: verified.token }),
		]);
		expect(a.id).toBe(b.id);
		expect(a.status).toBe("confirmed");
		expect(
			(await app.ops.listBookings({ hostId: "host", period: "all" })).filter(
				(booking) => booking.status !== "cancelled",
			),
		).toHaveLength(2);
	});

	it("promotes in verified order across concurrent cancellation and releases a cancelled offer once", async () => {
		const app = await full();
		const one = await join(app, "one@example.com");
		const two = await join(app, "two@example.com");
		await app.ops.verifyWaitlistEntry({ token: two.token });
		vi.setSystemTime(Date.now() + 1);
		await app.ops.verifyWaitlistEntry({ token: one.token });
		await Promise.all([
			app.ops.cancelBooking({ token: app.first.cancelToken }),
			app.ops.cancelBooking({ token: app.first.cancelToken }),
		]);
		expect(app.offers.map((entry) => entry.id)).toEqual([two.id]);
		await Promise.all([
			app.ops.cancelWaitlistEntry({ token: two.token }),
			app.ops.cancelWaitlistEntry({ token: two.token }),
		]);
		expect(app.offers.map((entry) => entry.id)).toEqual([two.id, one.id]);
		await expect(
			app.ops.acceptWaitlistOffer({ token: two.token }),
		).rejects.toThrow("no longer available");
	});

	it("expires offers and verification links, promotes the next attendee and never reuses a released seat", async () => {
		const app = await full();
		const one = await join(app, "one@example.com");
		const two = await join(app, "two@example.com");
		await app.ops.verifyWaitlistEntry({ token: one.token });
		vi.setSystemTime(Date.now() + 1);
		await app.ops.verifyWaitlistEntry({ token: two.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		vi.setSystemTime(Date.now() + 15 * 60_000);
		await expect(
			app.ops.acceptWaitlistOffer({ token: one.token }),
		).rejects.toThrow("no longer available");
		await app.ops.dispatchWaitlist({ hostId: "host" });
		expect((await app.ops.getWaitlistEntry({ token: one.token })).status).toBe(
			"expired",
		);
		expect((await app.ops.getWaitlistEntry({ token: two.token })).status).toBe(
			"offered",
		);
		await app.ops.acceptWaitlistOffer({ token: two.token });
		await app.ops.dispatchWaitlist({ hostId: "host" });
		await expect(
			app.ops.createBooking(attendee("third@example.com")),
		).rejects.toThrow("no longer available");
	});

	it("requires an attendee with an active offer to accept it instead of holding two seats", async () => {
		const app = await full();
		const entry = await join(app);
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		await app.ops.cancelBooking({ token: app.second.cancelToken });
		await expect(app.ops.createBooking(attendee(entry.email))).rejects.toThrow(
			"already has a reservation",
		);
		const other = await app.ops.createBooking({
			...attendee(entry.email),
			start: "2030-01-07T10:00:00Z",
		});
		await expect(
			app.ops.rescheduleBooking({
				token: other.cancelToken,
				start,
				timezone: "UTC",
			}),
		).rejects.toThrow("already has a reservation");
		expect(
			(await app.ops.acceptWaitlistOffer({ token: entry.token })).status,
		).toBe("confirmed");
	});

	it("serializes both released seats with concurrent dispatch, joins and direct reservations", async () => {
		const app = await full();
		const one = await join(app, "one@example.com");
		const two = await join(app, "two@example.com");
		await app.ops.verifyWaitlistEntry({ token: one.token });
		vi.setSystemTime(Date.now() + 1);
		await app.ops.verifyWaitlistEntry({ token: two.token });
		await Promise.allSettled([
			app.ops.cancelBooking({ token: app.first.cancelToken }),
			app.ops.cancelBooking({ token: app.second.cancelToken }),
			app.ops.joinWaitlist(attendee("late@example.com")),
			app.ops.dispatchWaitlist({ hostId: "host" }),
			app.ops.createBooking(attendee("direct@example.com")),
		]);
		expect(app.offers).toHaveLength(2);
		const results = await Promise.all([
			app.ops.acceptWaitlistOffer({ token: one.token }),
			app.ops.acceptWaitlistOffer({ token: two.token }),
		]);
		expect(new Set(results.map((booking) => booking.id)).size).toBe(2);
		expect(
			(await app.ops.listBookings({ hostId: "host", period: "all" })).filter(
				(booking) => booking.status !== "cancelled",
			),
		).toHaveLength(2);
	});

	it("rejects expired verification links and offers whose event duration changed", async () => {
		const app = await full();
		const old = await join(app, "old@example.com");
		vi.setSystemTime(Date.now() + 24 * 60 * 60_000);
		await expect(
			app.ops.verifyWaitlistEntry({ token: old.token }),
		).rejects.toThrow("no longer active");
		const fresh = await join(app, "fresh@example.com");
		await app.ops.verifyWaitlistEntry({ token: fresh.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		await app.ops.cancelBooking({ token: app.second.cancelToken });
		await app.ops.updateEventType({
			id: app.event.id,
			data: { ...input, duration: 60 },
		});
		await expect(
			app.ops.acceptWaitlistOffer({ token: fresh.token }),
		).rejects.toThrow("no longer available");
	});

	it("accepts paid offers through normal pending-payment holds and reuses checkout on retry", async () => {
		const createPayment = vi.fn(async () => ({
			clientSecret: "checkout-secret",
		}));
		const paymentAdapter = {
			name: "test",
			createPayment,
			handleWebhook: async () => null,
		};
		const app = await full(
			{ paymentAdapter },
			{ price: 1000, currency: "USD" },
		);
		const entry = await join(app);
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		const result = await app.ops.acceptWaitlistOffer({ token: entry.token });
		expect(result.status).toBe("pending_payment");
		expect(result.checkout).toEqual({ clientSecret: "checkout-secret" });
		expect((await app.ops.acceptWaitlistOffer({ token: entry.token })).id).toBe(
			result.id,
		);
		expect(createPayment).toHaveBeenCalledTimes(3);
		await app.ops.dispatchWaitlist({ hostId: "host" });
		await expect(
			app.ops.createBooking(attendee("direct@example.com")),
		).rejects.toThrow("no longer available");
	});

	it("keeps delivery failures retriable with the same entry and offer secret", async () => {
		const verify = vi
			.fn()
			.mockRejectedValueOnce(new Error("mail offline"))
			.mockResolvedValue(undefined);
		const offer = vi
			.fn()
			.mockRejectedValueOnce(new Error("mail offline"))
			.mockResolvedValue(undefined);
		const app = await full({
			hooks: { onWaitlistVerification: verify, onWaitlistOffer: offer },
		});
		await expect(
			app.ops.joinWaitlist(attendee("waiting@example.com")),
		).rejects.toThrow("mail offline");
		await app.ops.joinWaitlist(attendee("waiting@example.com"));
		expect(verify.mock.calls[0]?.[0].token).toBe(
			verify.mock.calls[1]?.[0].token,
		);
		const entry = verify.mock.calls[0]![0] as WaitlistEntry;
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		expect(
			(await app.ops.cancelBooking({ token: app.first.cancelToken })).status,
		).toBe("cancelled");
		await app.ops.dispatchWaitlist({ hostId: "host" });
		expect(offer).toHaveBeenCalledTimes(2);
		expect(offer.mock.calls[0]?.[0].offerExpiresAt).toBe(
			offer.mock.calls[1]?.[0].offerExpiresAt,
		);
	});

	it("commits cancellation during an external availability outage and retries promotion later", async () => {
		const getBusy = vi
			.fn<NonNullable<CalendarBackendConfig["getBusyIntervals"]>>()
			.mockResolvedValue([]);
		const app = await full({ getBusyIntervals: getBusy });
		const entry = await join(app);
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		getBusy.mockRejectedValue(new Error("calendar offline"));
		expect(
			(await app.ops.cancelBooking({ token: app.first.cancelToken })).status,
		).toBe("cancelled");
		expect(
			(await app.ops.getWaitlistEntry({ token: entry.token })).status,
		).toBe("waiting");
		expect(app.offers).toHaveLength(0);
		await expect(
			app.ops.createBooking({
				...attendee("other@example.com"),
				start: "2030-01-07T10:00:00Z",
			}),
		).rejects.toThrow("availability could not be verified");
		getBusy.mockResolvedValue([]);
		await app.ops.dispatchWaitlist({ hostId: "host" });
		expect(
			(await app.ops.getWaitlistEntry({ token: entry.token })).status,
		).toBe("offered");
	});

	it.each(["failed", "refunded"] as const)(
		"commits %s payment cancellation during an external availability outage",
		async (status) => {
			const getBusy = vi
				.fn<NonNullable<CalendarBackendConfig["getBusyIntervals"]>>()
				.mockResolvedValue([]);
			let webhook: PaymentWebhookResult | null = null;
			const cancelled = vi.fn();
			const app = await full(
				{
					getBusyIntervals: getBusy,
					hooks: { onAfterCancelBooking: cancelled },
					paymentAdapter: {
						name: "test",
						createPayment: async () => ({ clientSecret: "secret" }),
						handleWebhook: async () => webhook,
					},
				},
				{ price: 1000, currency: "USD" },
			);
			const entry = await join(app);
			await app.ops.verifyWaitlistEntry({ token: entry.token });
			const payment = {
				orderId: `calendar:${app.first.id}`,
				paymentRef: "payment-first",
				amount: 1000,
				currency: "USD",
			};
			if (status === "refunded") {
				webhook = { ...payment, status: "paid" };
				expect((await app.request("/calendar/webhook", "POST")).status).toBe(
					200,
				);
			}
			getBusy.mockRejectedValue(new Error("calendar offline"));
			webhook = { ...payment, status };
			expect((await app.request("/calendar/webhook", "POST")).status).toBe(200);
			expect(
				(await app.ops.getBooking({ token: app.first.cancelToken })).status,
			).toBe("cancelled");
			expect(
				(await app.ops.getWaitlistEntry({ token: entry.token })).status,
			).toBe("waiting");
			expect(cancelled).toHaveBeenCalledTimes(1);
			expect((await app.request("/calendar/webhook", "POST")).status).toBe(200);
			expect(cancelled).toHaveBeenCalledTimes(1);
			getBusy.mockResolvedValue([]);
			await app.ops.dispatchWaitlist({ hostId: "host" });
			expect(
				(await app.ops.getWaitlistEntry({ token: entry.token })).status,
			).toBe("offered");
		},
	);

	it("returns an unrelated booking and confirmation when offer delivery fails, with strict dispatch retry", async () => {
		const confirmed = vi.fn();
		const deliver = vi.fn().mockRejectedValue(new Error("mail offline"));
		const app = await full({
			hooks: { onAfterConfirmBooking: confirmed, onWaitlistOffer: deliver },
		});
		const entry = await join(app);
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		expect(
			(await app.ops.cancelBooking({ token: app.first.cancelToken })).status,
		).toBe("cancelled");
		const response = await app.request("/calendar/book/group", "POST", {
			...attendee("other@example.com"),
			start: "2030-01-07T10:00:00Z",
		});
		expect(response.status).toBe(200);
		const booking = await response.json();
		expect(booking.cancelToken).toBeTruthy();
		expect(confirmed).toHaveBeenLastCalledWith(
			expect.objectContaining({ id: booking.id }),
		);
		await expect(app.ops.dispatchWaitlist({ hostId: "host" })).rejects.toThrow(
			"mail offline",
		);
		deliver.mockResolvedValue(undefined);
		await app.ops.dispatchWaitlist({ hostId: "host" });
		const count = deliver.mock.calls.length;
		await app.ops.dispatchWaitlist({ hostId: "host" });
		expect(deliver).toHaveBeenCalledTimes(count);
	});

	it("counts offer holds against limits, rescheduling and capacity reductions", async () => {
		const app = await full(undefined, { limits: { perDay: 2 } });
		const entry = await join(app);
		await app.ops.verifyWaitlistEntry({ token: entry.token });
		await app.ops.cancelBooking({ token: app.first.cancelToken });
		await expect(
			app.ops.updateEventType({
				id: app.event.id,
				data: { ...input, capacity: 1 },
			}),
		).rejects.toThrow("Capacity cannot be lower");
		await expect(
			app.ops.createBooking({
				...attendee("other@example.com"),
				start: "2030-01-07T10:00:00Z",
			}),
		).rejects.toThrow("no longer available");
		const other = await app.ops.createEventType({
			hostId: "host",
			...input,
			slug: "other",
			capacity: 1,
			waitlistEnabled: false,
		});
		const booking = await app.ops.createBooking({
			...attendee("other@example.com"),
			slug: other.slug,
			start: "2030-01-07T10:00:00Z",
		});
		await expect(
			app.ops.rescheduleBooking({
				token: booking.cancelToken,
				start,
				timezone: "UTC",
			}),
		).rejects.toThrow("no longer available");
	});
});
