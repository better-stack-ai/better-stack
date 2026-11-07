import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("verified waitlist attendee accepts a released group place without exposing the private link to the host", async ({
	page,
	request,
}) => {
	const slug = `calendar-waitlist-${Date.now()}`;
	const date = new Date(Date.now() + 14 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const start = `${date}T09:00:00.000Z`;
	const host = mockAuthHeaders("calendar-waitlist-host");
	const created = await request.post("/api/data/calendar/events", {
		headers: host,
		data: {
			slug,
			name: `Waitlist workshop ${slug}`,
			duration: 30,
			capacity: 2,
			waitlistEnabled: true,
			timezone: "UTC",
			weeklyAvailability: [],
			dateOverrides: [{ date, intervals: [{ start: "09:00", end: "09:30" }] }],
		},
	});
	expect(created.ok(), await created.text()).toBe(true);
	const event = await created.json();
	try {
		const bookingIds: string[] = [];
		for (const name of ["Ari", "Sam"]) {
			const booked = await request.post(`/api/data/calendar/book/${slug}`, {
				data: {
					start,
					timezone: "UTC",
					name,
					email: `${slug}-${name}@example.com`,
				},
			});
			expect(booked.ok(), await booked.text()).toBe(true);
			bookingIds.push((await booked.json()).id);
		}
		await page.goto(`/pages/calendar/book/${slug}`);
		await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
		await page.getByLabel("Date", { exact: true }).fill(date);
		await expect(page.getByTestId("calendar-slot")).toHaveCount(0);
		await page.getByTestId("calendar-waitlist-slot").click();
		await page.getByLabel("Your name", { exact: true }).fill("Alice Johnson");
		await page.getByLabel("Email", { exact: true }).fill("alice@example.com");
		await page
			.getByRole("button", { name: "Join waitlist", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Check your email" }),
		).toBeVisible();
		const inboxResponse = await request.get("/api/data/notifications", {
			headers: mockAuthHeaders("user-1"),
		});
		expect(inboxResponse.ok(), await inboxResponse.text()).toBe(true);
		const { items } = await inboxResponse.json();
		const delivery = items.find(
			(item: { title: string; body: string }) =>
				item.title === "Verify your waitlist request" &&
				item.body.includes(event.name),
		);
		expect(delivery?.href).toMatch(/^\/pages\/calendar\/waitlist\//);
		const token = delivery.href.split("/").at(-1);
		const forged = await request.post(
			`/api/data/calendar/waitlist/${token}forged/verify`,
		);
		expect(forged.ok()).toBe(false);
		await page.goto(delivery.href);
		await page
			.getByRole("button", { name: "Verify email and join waitlist" })
			.click();
		await expect(page.getByText(/^You are on the waitlist\./)).toBeVisible();
		await setMockAuthCookie(page.context(), "calendar-waitlist-host");
		await page.goto("/pages/calendar");
		await expect(
			page.getByRole("heading", { name: "Waitlist", exact: true }),
		).toBeVisible();
		const hostEntries = await request.get(
			`/api/data/calendar/waitlist?eventTypeId=${event.id}`,
			{
				headers: host,
			},
		);
		expect(hostEntries.ok(), await hostEntries.text()).toBe(true);
		expect(await hostEntries.text()).not.toContain(token);
		const cancelled = await request.post(
			`/api/data/calendar/bookings/${bookingIds[0]}/cancel`,
			{
				headers: host,
			},
		);
		expect(cancelled.ok(), await cancelled.text()).toBe(true);
		const bypass = await request.post(`/api/data/calendar/book/${slug}`, {
			data: {
				start,
				timezone: "UTC",
				name: "Late attendee",
				email: `${slug}-late@example.com`,
			},
		});
		expect(bypass.ok()).toBe(false);
		await page.context().clearCookies();
		await page.goto(delivery.href);
		await expect(page.getByText(/^A place is available\./)).toBeVisible();
		await page
			.getByRole("button", { name: "Accept offer", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking confirmed", exact: true }),
		).toBeVisible();
		await page.reload();
		await page
			.getByRole("button", { name: "View booking", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking confirmed", exact: true }),
		).toBeVisible();
		await page.getByRole("link", { name: "Manage or cancel booking" }).click();
		await page
			.getByRole("button", { name: "Cancel booking", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking cancelled" }),
		).toBeVisible();
	} finally {
		const bookings = await request.get(
			"/api/data/calendar/bookings?period=all",
			{
				headers: host,
			},
		);
		expect(bookings.ok(), await bookings.text()).toBe(true);
		for (const booking of await bookings.json()) {
			if (booking.eventTypeId === event.id && booking.status !== "cancelled") {
				const cancelled = await request.post(
					`/api/data/calendar/bookings/${booking.id}/cancel`,
					{ headers: host },
				);
				expect(cancelled.ok(), await cancelled.text()).toBe(true);
			}
		}
		const removed = await request.delete(
			`/api/data/calendar/events/${event.id}`,
			{
				headers: host,
			},
		);
		expect(removed.ok(), await removed.text()).toBe(true);
	}
});
