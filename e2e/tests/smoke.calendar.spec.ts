import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

test("guest books, downloads an invite, reschedules and cancels an appointment", async ({
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
			dateOverrides: [{ date, intervals: [{ start: "09:00", end: "10:00" }] }],
		},
	});
	expect(created.ok(), await created.text()).toBe(true);
	const event = await created.json();
	const slotsPath = `/api/data/calendar/book/${slug}/slots?date=${date}&timezone=UTC`;

	try {
		await setMockAuthCookie(page.context());
		await page.goto("/pages/calendar");
		await expect(
			page.getByRole("heading", { name: "Calendar", exact: true }),
		).toBeVisible();
		await page.context().clearCookies();
		await page.goto(`/pages/calendar/book/${slug}`);
		await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
		await page.getByLabel("Date", { exact: true }).fill(date);
		await page.getByTestId("calendar-slot").first().click();
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
		expect((await bookedSlots.json()).slots).toHaveLength(1);
		const inviteDownload = page.waitForEvent("download");
		await page
			.getByRole("link", { name: "Download calendar invite (.ics)" })
			.click();
		const invite = await inviteDownload;
		expect(invite.suggestedFilename()).toBe("booking.ics");
		expect(await readFile((await invite.path())!, "utf8")).toContain(
			`DTSTART:${date.replaceAll("-", "")}T090000Z`,
		);

		await page.getByRole("link", { name: "Manage or cancel booking" }).click();
		await expect(page).toHaveURL(/\/calendar\/cancel\//);
		const managementURL = page.url();
		await page
			.getByRole("link", { name: "Reschedule booking", exact: true })
			.click();
		await page
			.getByLabel("Timezone", { exact: true })
			.selectOption("America/New_York");
		await page.getByTestId("calendar-slot").last().click();
		await page.getByRole("button", { name: "Confirm new time" }).click();
		await expect(
			page.getByRole("heading", { name: "Booking rescheduled", exact: true }),
		).toBeVisible();
		const updatedDownload = page.waitForEvent("download");
		await page
			.getByRole("link", { name: "Download calendar invite (.ics)" })
			.click();
		expect(
			await readFile((await (await updatedDownload).path())!, "utf8"),
		).toContain(`DTSTART:${date.replaceAll("-", "")}T093000Z`);
		await page
			.getByRole("link", { name: "Manage booking", exact: true })
			.click();
		await expect(page).toHaveURL(managementURL);
		await expect(
			page.getByText("America/New_York", { exact: false }),
		).toBeVisible();
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
			{
				start: `${date}T09:30:00.000Z`,
				end: `${date}T10:00:00.000Z`,
				remaining: 1,
			},
		]);
		await page.goto("/pages/calendar/cancel/invalid-calendar-token");
		await expect(
			page.getByText(
				"Calendar information could not be loaded. Check your link or try again.",
				{ exact: true },
			),
		).toBeVisible();
		await expect(page.locator("body")).not.toContainText(
			"Minified React error",
		);
	} finally {
		await request.delete(`/api/data/calendar/events/${event.id}`, {
			headers: mockAuthHeaders(),
		});
	}
});

test("paid booking holds a time and shows pending payment in guest and host management", async ({
	page,
	request,
}) => {
	const slug = `calendar-paid-${Date.now()}`;
	const date = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
	const response = await request.post("/api/data/calendar/events", {
		headers: mockAuthHeaders(),
		data: {
			slug,
			name: "Paid calendar appointment",
			duration: 30,
			timezone: "UTC",
			price: 2500,
			currency: "USD",
			weeklyAvailability: [],
			dateOverrides: [{ date, intervals: [{ start: "09:00", end: "09:30" }] }],
		},
	});
	expect(response.ok(), await response.text()).toBe(true);
	const event = await response.json();
	try {
		await page.goto(`/pages/calendar/book/${slug}`);
		await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
		await page.getByLabel("Date", { exact: true }).fill(date);
		await expect(page.getByText(/Price:.*25\.00/)).toBeVisible();
		await page.getByTestId("calendar-slot").click();
		await page.getByLabel("Your name", { exact: true }).fill("Paid attendee");
		await page
			.getByLabel("Email", { exact: true })
			.fill("paid-calendar@example.com");
		await page.getByRole("button", { name: "Reserve pending payment" }).click();
		await expect(
			page.getByRole("heading", { name: "Booking awaiting payment" }),
		).toBeVisible();
		expect(
			(
				await (
					await request.get(
						`/api/data/calendar/book/${slug}/slots?date=${date}&timezone=UTC`,
					)
				).json()
			).slots,
		).toEqual([]);
		await page.getByRole("link", { name: "Manage or cancel booking" }).click();
		await expect(page).toHaveURL(/\/calendar\/cancel\//);
		const token = page.url().split("/").at(-1)!;
		await expect(
			page.getByText(/Payment pending\. Your time is held/),
		).toBeVisible();
		await setMockAuthCookie(page.context());
		await page.goto("/pages/calendar");
		const row = page
			.getByRole("listitem")
			.filter({
				has: page.getByRole("heading", { name: "Paid calendar appointment" }),
			})
			.filter({ hasText: "paid-calendar@example.com" });
		await expect(
			row.getByText("Payment pending", { exact: true }),
		).toBeVisible();
		await expect(
			row.getByRole("link", { name: "Download calendar invite (.ics)" }),
		).toBeVisible();
		await request.post(`/api/data/calendar/cancel/${token}`);
	} finally {
		await request.delete(`/api/data/calendar/events/${event.id}`, {
			headers: mockAuthHeaders(),
		});
	}
});
