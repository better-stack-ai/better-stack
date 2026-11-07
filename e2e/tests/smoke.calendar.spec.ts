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

test("team booking selects an available host and exposes the assignment only in that host's dashboard", async ({
	page,
	request,
}) => {
	const suffix = Date.now();
	const date = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
	const hostIds = [`admin-team-a-${suffix}`, `admin-team-b-${suffix}`];
	const profiles: { id: string }[] = [];
	for (const [index, hostId] of hostIds.entries()) {
		const created = await request.post("/api/data/calendar/events", {
			headers: mockAuthHeaders(hostId),
			data: {
				slug: `team-profile-${index}-${suffix}`,
				name: `Team host ${index + 1} availability`,
				duration: 30,
				timezone: index === 0 ? "UTC" : "America/New_York",
				weeklyAvailability: [],
				dateOverrides: [
					{
						date,
						intervals: [
							{
								start:
									index === 0
										? "09:00"
										: new Intl.DateTimeFormat("en-GB", {
												hour: "2-digit",
												minute: "2-digit",
												timeZone: "America/New_York",
											}).format(new Date(`${date}T09:00:00Z`)),
								end:
									index === 0
										? "10:00"
										: new Intl.DateTimeFormat("en-GB", {
												hour: "2-digit",
												minute: "2-digit",
												timeZone: "America/New_York",
											}).format(new Date(`${date}T10:00:00Z`)),
							},
						],
					},
				],
			},
		});
		expect(created.ok(), await created.text()).toBe(true);
		profiles.push(await created.json());
	}
	const slug = `team-booking-${suffix}`;
	const teamResponse = await request.post("/api/data/calendar/events", {
		headers: mockAuthHeaders(),
		data: {
			slug,
			name: "Team consultation",
			duration: 30,
			timezone: "UTC",
			teamAvailabilityIds: profiles.map((profile) => profile.id),
			weeklyAvailability: [],
		},
	});
	expect(teamResponse.ok(), await teamResponse.text()).toBe(true);
	const event = await teamResponse.json();
	let token: string | undefined;
	try {
		await setMockAuthCookie(page.context());
		await page.goto(`/pages/calendar/events/${event.id}/edit`);
		await expect(
			page.getByLabel("Assign bookings across a team", { exact: true }),
		).toBeChecked();
		await expect(
			page.getByLabel("Host availability event IDs", { exact: true }),
		).toHaveValue(profiles.map((profile) => profile.id).join("\n"));
		await page.context().clearCookies();
		const publicEvent = await (
			await request.get(`/api/data/calendar/book/${slug}`)
		).json();
		expect(publicEvent.isTeam).toBe(true);
		expect(JSON.stringify(publicEvent)).not.toContain(profiles[0]!.id);
		await page.goto(`/pages/calendar/book/${slug}`);
		await expect(
			page.getByText("An available team host is assigned when you book.", {
				exact: true,
			}),
		).toBeVisible();
		await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
		await page.getByLabel("Date", { exact: true }).fill(date);
		await page.getByTestId("calendar-slot").first().click();
		await page.getByLabel("Your name", { exact: true }).fill("Team attendee");
		await page
			.getByLabel("Email", { exact: true })
			.fill(`team-${suffix}@example.com`);
		await page
			.getByRole("button", { name: "Confirm booking", exact: true })
			.click();
		await expect(
			page.getByRole("heading", { name: "Booking confirmed" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Manage or cancel booking" }).click();
		await expect(page).toHaveURL(/\/calendar\/cancel\//);
		token = page.url().split("/").at(-1)!;
		const booking = await (
			await request.get(`/api/data/calendar/cancel/${token}`)
		).json();
		expect(booking.hostId).toBe(hostIds[0]);
		await setMockAuthCookie(page.context(), hostIds[0]);
		await page.goto("/pages/calendar");
		const bookingRow = page
			.getByRole("listitem")
			.filter({ hasText: `team-${suffix}@example.com` });
		await expect(
			bookingRow.getByText(`Assigned host: ${hostIds[0]}`, { exact: true }),
		).toBeVisible();
		await setMockAuthCookie(page.context(), hostIds[1]);
		await page.reload();
		await expect(
			page.getByText(`team-${suffix}@example.com`, { exact: true }),
		).toHaveCount(0);
	} finally {
		if (token) await request.post(`/api/data/calendar/cancel/${token}`);
		await request.delete(`/api/data/calendar/events/${event.id}`, {
			headers: mockAuthHeaders(),
		});
		for (const [index, profile] of profiles.entries()) {
			await request.delete(`/api/data/calendar/events/${profile.id}`, {
				headers: mockAuthHeaders(hostIds[index]),
			});
		}
	}
});

for (const cancelledBeforeRetry of [false, true]) {
	test(
		cancelledBeforeRetry
			? "team booking shows a cancelled reservation when a lost-response retry follows host cancellation"
			: "team booking recovers a committed reservation after the response is lost",
		async ({ page, request }) => {
			const submitLabel = cancelledBeforeRetry
				? "Reserve pending payment"
				: "Confirm booking";
			const suffix = Date.now();
			const date = new Date(Date.now() + 11 * 86_400_000)
				.toISOString()
				.slice(0, 10);
			const profileResponse = await request.post("/api/data/calendar/events", {
				headers: mockAuthHeaders(),
				data: {
					slug: `retry-profile-${suffix}`,
					name: "Retry host availability",
					duration: 30,
					timezone: "UTC",
					weeklyAvailability: [],
					dateOverrides: [
						{ date, intervals: [{ start: "09:00", end: "09:30" }] },
					],
				},
			});
			expect(profileResponse.ok(), await profileResponse.text()).toBe(true);
			const profile = await profileResponse.json();
			const slug = `retry-team-${suffix}`;
			const eventResponse = await request.post("/api/data/calendar/events", {
				headers: mockAuthHeaders(),
				data: {
					slug,
					name: "Retry team consultation",
					duration: 30,
					timezone: "UTC",
					weeklyAvailability: [],
					teamAvailabilityIds: [profile.id],
					...(cancelledBeforeRetry ? { price: 2500, currency: "USD" } : {}),
				},
			});
			expect(eventResponse.ok(), await eventResponse.text()).toBe(true);
			const event = await eventResponse.json();
			let committedId = "";
			let committedToken = "";
			let firstKey = "";
			try {
				await page.goto(`/pages/calendar/book/${slug}`);
				await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
				await page.getByLabel("Date", { exact: true }).fill(date);
				await page.getByTestId("calendar-slot").click();
				await page
					.getByLabel("Your name", { exact: true })
					.fill("Retry attendee");
				await page
					.getByLabel("Email", { exact: true })
					.fill(`retry-${suffix}@example.com`);
				await page.route(`**/api/data/calendar/book/${slug}`, async (route) => {
					if (route.request().method() !== "POST") return route.continue();
					const input = route.request().postDataJSON();
					if (committedId) {
						expect(input.idempotencyKey).toBe(firstKey);
						return route.continue();
					}
					firstKey = input.idempotencyKey;
					const response = await route.fetch();
					expect(response.ok()).toBe(true);
					const booking = await response.json();
					committedId = booking.id;
					committedToken = booking.cancelToken;
					await route.abort("connectionfailed");
				});
				await page
					.getByRole("button", { name: submitLabel, exact: true })
					.click();
				await expect(
					page.getByRole("alert").filter({ hasText: /fetch|network|failed/i }),
				).toBeVisible();
				await expect(
					page.getByText(
						"No available times on this date. Choose another date.",
						{
							exact: true,
						},
					),
				).toBeVisible();
				await expect(page.getByTestId("calendar-slot")).toHaveCount(0);
				const retry = page.getByRole("button", {
					name: submitLabel,
					exact: true,
				});
				await expect(retry).toBeEnabled();
				if (cancelledBeforeRetry) {
					const cancelled = await request.post(
						`/api/data/calendar/bookings/${committedId}/cancel`,
						{ headers: mockAuthHeaders() },
					);
					expect(cancelled.ok(), await cancelled.text()).toBe(true);
				}
				const replayResponse = page.waitForResponse(
					(response) =>
						response.request().method() === "POST" &&
						response.url().endsWith(`/calendar/book/${slug}`),
				);
				await retry.click();
				expect(await (await replayResponse).json()).toMatchObject({
					id: committedId,
					status: cancelledBeforeRetry ? "cancelled" : "confirmed",
				});
				await expect(
					page.getByRole("heading", {
						name: cancelledBeforeRetry
							? "Booking cancelled"
							: "Booking confirmed",
						exact: true,
					}),
				).toBeVisible({ timeout: 5000 });
				if (cancelledBeforeRetry) {
					await expect(
						page.getByRole("heading", {
							name: "Booking confirmed",
							exact: true,
						}),
					).toHaveCount(0);
					await expect(
						page.getByText(
							/Payment pending|Your time is held|Complete payment/i,
						),
					).toHaveCount(0);
					const invite = page.getByRole("link", {
						name: "Download calendar invite (.ics)",
					});
					await expect(invite).toBeVisible();
					const download = page.waitForEvent("download");
					await invite.click();
					expect(
						await readFile((await (await download).path())!, "utf8"),
					).toContain("STATUS:CANCELLED");
				}
				const bookings = await (
					await request.get("/api/data/calendar/bookings", {
						headers: mockAuthHeaders(),
					})
				).json();
				expect(
					bookings.filter(
						(booking: { eventTypeId: string }) =>
							booking.eventTypeId === event.id,
					),
				).toHaveLength(1);
			} finally {
				if (committedToken)
					await request.post(`/api/data/calendar/cancel/${committedToken}`);
				await request.delete(`/api/data/calendar/events/${event.id}`, {
					headers: mockAuthHeaders(),
				});
				await request.delete(`/api/data/calendar/events/${profile.id}`, {
					headers: mockAuthHeaders(),
				});
			}
		},
	);
}
