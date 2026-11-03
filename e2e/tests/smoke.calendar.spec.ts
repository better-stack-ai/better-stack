import { expect, test } from "@playwright/test";
import { mockAuthHeaders } from "./helpers/mock-auth";

test("guest books and cancels an appointment, releasing its capacity", async ({
	page,
	request,
}) => {
	const slug = `calendar-e2e-${Date.now()}`;
	const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
	const created = await request.post("/api/data/calendar/events", {
		headers: mockAuthHeaders(),
		data: {
			slug,
			name: "Calendar smoke appointment",
			duration: 30,
			capacity: 1,
			timezone: "UTC",
			weeklyAvailability: [],
			dateOverrides: [{ date, intervals: [{ start: "09:00", end: "09:30" }] }],
		},
	});
	expect(created.ok(), await created.text()).toBe(true);
	const event = await created.json();
	const slotsPath = `/api/data/calendar/book/${slug}/slots?date=${date}&timezone=UTC`;

	try {
		await page.goto(`/pages/calendar/book/${slug}`);
		await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
		await page.getByLabel("Date", { exact: true }).fill(date);
		await page.getByTestId("calendar-slot").click();
		await page
			.getByLabel("Your name", { exact: true })
			.fill("Calendar attendee");
		await page
			.getByLabel("Email", { exact: true })
			.fill("calendar@example.com");
		await page
			.getByRole("button", { name: "Confirm booking", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking confirmed" }),
		).toBeVisible();
		const bookedSlots = await request.get(slotsPath);
		expect(bookedSlots.ok()).toBe(true);
		expect((await bookedSlots.json()).slots).toEqual([]);

		await page.getByRole("link", { name: "Manage or cancel booking" }).click();
		await page
			.getByRole("button", { name: "Cancel booking", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking cancelled" }),
		).toBeVisible();
		const releasedSlots = await request.get(slotsPath);
		expect(releasedSlots.ok()).toBe(true);
		expect((await releasedSlots.json()).slots).toEqual([
			{
				start: `${date}T09:00:00.000Z`,
				end: `${date}T09:30:00.000Z`,
				remaining: 1,
			},
		]);
	} finally {
		await request.delete(`/api/data/calendar/events/${event.id}`, {
			headers: mockAuthHeaders(),
		});
	}
});
