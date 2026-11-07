import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("host connects, selects a calendar, retries a failed sync and disconnects", async ({
	page,
	request,
}) => {
	const slug = `calendar-provider-${Date.now()}`;
	const date = new Date(Date.now() + 14 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	let eventId: string | undefined;
	let token: string | undefined;
	const connectionIds: string[] = [];
	const headers = mockAuthHeaders("calendar-provider-host");
	try {
		await setMockAuthCookie(page.context(), "calendar-provider-host");
		await page.goto("/pages/calendar");
		await expect(
			page.getByRole("heading", { name: "Connected calendars", exact: true }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Connect Google", exact: true })
			.click();
		await expect(
			page.getByLabel("Calendar for Demo Google account", { exact: true }),
		).toBeVisible();
		const connectionResponse = await request.get(
			"/api/data/calendar/connections",
			{ headers },
		);
		expect(connectionResponse.ok(), await connectionResponse.text()).toBe(true);
		const { connections } = await connectionResponse.json();
		connectionIds.push(connections[0].id);
		await page
			.getByLabel("Calendar for Demo Google account", { exact: true })
			.selectOption("appointments");
		await page
			.getByRole("button", { name: "Save calendar", exact: true })
			.click();
		await expect(
			page.getByText("Google · Appointments", { exact: true }),
		).toBeVisible();

		const created = await request.post("/api/data/calendar/events", {
			headers,
			data: {
				slug,
				name: "Provider retry appointment",
				duration: 30,
				timezone: "UTC",
				weeklyAvailability: [],
				dateOverrides: [
					{ date, intervals: [{ start: "09:00", end: "10:00" }] },
				],
			},
		});
		expect(created.ok(), await created.text()).toBe(true);
		eventId = (await created.json()).id;
		const booked = await request.post(`/api/data/calendar/book/${slug}`, {
			data: {
				start: `${date}T09:00:00.000Z`,
				timezone: "UTC",
				name: "Provider attendee",
				email: "provider@example.com",
			},
		});
		expect(booked.ok(), await booked.text()).toBe(true);
		const booking = await booked.json();
		token = booking.cancelToken;
		expect(booking.status).toBe("confirmed");
		await page.reload();
		const sync = page
			.getByTestId("calendar-sync-state")
			.filter({ hasText: booking.id });
		await expect(sync.getByText("Sync failed", { exact: true })).toBeVisible();
		await sync.getByRole("button", { name: /Retry synchronization/ }).click();
		await expect(sync.getByText("Synced", { exact: true })).toBeVisible();
		await expect(sync.getByText(/2 attempts/)).toBeVisible();
		const synced = await (
			await request.get("/api/data/calendar/connections", { headers })
		).json();
		const originalEventId = synced.sync.find(
			(item: { bookingId: string }) => item.bookingId === booking.id,
		).eventId;
		expect(originalEventId).toBeTruthy();

		const moved = await request.post(`/api/data/calendar/reschedule/${token}`, {
			data: { start: `${date}T09:30:00.000Z`, timezone: "UTC" },
		});
		expect(moved.ok(), await moved.text()).toBe(true);
		const rescheduled = await (
			await request.get("/api/data/calendar/connections", { headers })
		).json();
		expect(
			rescheduled.sync.find(
				(item: { bookingId: string }) => item.bookingId === booking.id,
			),
		).toMatchObject({ state: "synced", eventId: originalEventId });
		const cancelled = await request.post(`/api/data/calendar/cancel/${token}`);
		expect(cancelled.ok(), await cancelled.text()).toBe(true);
		token = undefined;
		await page.reload();
		await expect(sync.getByText("Synced", { exact: true })).toBeVisible();
		await expect(sync.getByText(/4 attempts/)).toBeVisible();
		page.once("dialog", (dialog) => dialog.accept());
		await page
			.getByRole("button", {
				name: "Disconnect Demo Google account",
				exact: true,
			})
			.click();
		await expect(
			page.getByRole("button", { name: "Connect Google", exact: true }),
		).toBeEnabled();
		await expect(
			page.getByLabel("Calendar for Demo Google account", { exact: true }),
		).toHaveCount(0);
	} finally {
		if (token) await request.post(`/api/data/calendar/cancel/${token}`);
		for (const id of connectionIds)
			await request.delete(`/api/data/calendar/connections/${id}`, { headers });
		if (eventId)
			await request.delete(`/api/data/calendar/events/${eventId}`, { headers });
	}
});
