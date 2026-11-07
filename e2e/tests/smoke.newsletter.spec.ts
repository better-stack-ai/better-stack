import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";
import { waitForTanStackHydration } from "./helpers/hydration";

test("newsletter manages subscribers, edits a draft and sends to its tagged audience", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const email = `reader-${suffix}@example.com`;
	const subject = `Field notes ${suffix}`;
	const tag = `newsletter-${suffix}`;
	const headers = mockAuthHeaders();
	let subscriberId: string | undefined;
	let campaignId: string | undefined;

	expect((await request.get("/api/data/newsletter/subscribers")).status()).toBe(
		401,
	);
	expect((await request.get("/api/data/newsletter/campaigns")).status()).toBe(
		401,
	);
	await setMockAuthCookie(context);

	try {
		await page.goto("/pages/newsletter/subscribers");
		await waitForTanStackHydration(page);
		await page.waitForLoadState("networkidle");
		await page
			.getByRole("button", { name: "Add subscriber", exact: true })
			.click();
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByLabel("Name", { exact: true }).fill("Newsletter reader");
		await page.getByLabel("Tags", { exact: true }).fill(tag);
		await page
			.getByRole("button", { name: "Save subscriber", exact: true })
			.click();
		await expect(
			page.getByRole("cell").filter({ hasText: email }),
		).toBeVisible();
		const subscribers = await request.get(
			`/api/data/newsletter/subscribers?query=${email}`,
			{ headers },
		);
		expect(subscribers.ok(), await subscribers.text()).toBe(true);
		const subscriber = (await subscribers.json()).items[0];
		subscriberId = subscriber.id;
		expect(subscriber).toMatchObject({
			email,
			tags: [tag],
			status: "subscribed",
		});
		expect(subscriber).not.toHaveProperty("unsubscribeToken");

		await page.getByRole("link", { name: "Campaigns", exact: true }).click();
		await page.getByRole("link", { name: "New campaign", exact: true }).click();
		await page.getByLabel("Subject", { exact: true }).fill(subject);
		await page
			.getByLabel("From name", { exact: true })
			.fill("BTST field notes");
		await page
			.getByLabel("From email", { exact: true })
			.fill("news@example.com");
		await page.getByLabel("Audience tags", { exact: true }).fill(tag);
		await page
			.getByLabel("Email body", { exact: true })
			.fill(
				"# This week's update\n\nRead the [release notes](https://example.com/releases).",
			);
		await page.getByRole("button", { name: "Save draft", exact: true }).click();
		await expect(page).toHaveURL(/\/newsletter\/campaigns\/(?!new)[^/?]+$/);
		campaignId = new URL(page.url()).pathname.split("/").at(-1);
		await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
			subject,
		);
		await page
			.getByLabel("Test email address", { exact: true })
			.fill("editor@example.com");
		await page
			.getByRole("button", { name: "Send test email", exact: true })
			.click();
		await expect(
			page.getByText("Test email sent", { exact: true }),
		).toBeVisible();

		await page
			.getByRole("button", { name: "Send campaign", exact: true })
			.click();
		await page.getByRole("button", { name: "Send now", exact: true }).click();
		await expect
			.poll(async () => {
				const response = await request.get(
					`/api/data/newsletter/campaigns/${campaignId}`,
					{ headers },
				);
				return (await response.json()).status;
			})
			.toBe("sent");
		const stats = await request.get(
			`/api/data/newsletter/campaigns/${campaignId}/stats`,
			{ headers },
		);
		expect(stats.ok(), await stats.text()).toBe(true);
		expect(await stats.json()).toMatchObject({
			recipientCount: 1,
			delivered: 1,
			opened: 0,
			clicked: 0,
		});
		const resend = await request.post(
			`/api/data/newsletter/campaigns/${campaignId}/send`,
			{ headers, data: {} },
		);
		expect(resend.ok()).toBe(false);
		await page.goto(`/pages/newsletter/campaigns/${campaignId}/stats`);
		await expect(
			page.getByRole("heading", { name: subject, exact: true }),
		).toBeVisible();
		await expect(page.getByText("Delivered", { exact: true })).toBeVisible();
		const scheduledResponse = await request.post(
			"/api/data/newsletter/campaigns",
			{
				headers,
				data: {
					subject: `Scheduled ${suffix}`,
					fromName: "BTST",
					fromEmail: "news@example.com",
					body: "A future update",
					tags: [tag],
				},
			},
		);
		expect(scheduledResponse.ok(), await scheduledResponse.text()).toBe(true);
		const scheduled = await scheduledResponse.json();
		const scheduleResponse = await request.post(
			`/api/data/newsletter/campaigns/${scheduled.id}/schedule`,
			{
				headers,
				data: { scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
			},
		);
		expect(scheduleResponse.ok(), await scheduleResponse.text()).toBe(true);
		await page.goto(`/pages/newsletter/campaigns/${scheduled.id}`);
		await page
			.getByRole("button", { name: "Delete scheduled campaign", exact: true })
			.click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Delete campaign", exact: true })
			.click();
		await expect(page).toHaveURL(/\/newsletter\/campaigns$/);
		expect(
			(
				await request.get(`/api/data/newsletter/campaigns/${scheduled.id}`, {
					headers,
				})
			).status(),
		).toBe(404);
	} finally {
		if (campaignId)
			await request.delete(`/api/data/newsletter/campaigns/${campaignId}`, {
				headers,
			});
		if (subscriberId)
			await request.delete(`/api/data/newsletter/subscribers/${subscriberId}`, {
				headers,
			});
	}
});

test("newsletter requires a verified outcome before resuming an uncertain recipient", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const tag = `newsletter-recovery-${suffix}`;
	const uncertainEmail = `newsletter-uncertain-${suffix}@example.com`;
	const headers = mockAuthHeaders();
	const subscriberIds: string[] = [];
	let campaignId: string | undefined;
	await setMockAuthCookie(context);
	try {
		for (const email of [
			`newsletter-accepted-${suffix}@example.com`,
			uncertainEmail,
		]) {
			const response = await request.post("/api/data/newsletter/subscribers", {
				headers,
				data: { email, tags: [tag] },
			});
			expect(response.ok(), await response.text()).toBe(true);
			subscriberIds.push((await response.json()).id);
		}
		const created = await request.post("/api/data/newsletter/campaigns", {
			headers,
			data: {
				subject: `Recovery field notes ${suffix}`,
				fromName: "BTST",
				fromEmail: "news@example.com",
				body: "An interrupted campaign can resume after its outcome is verified.",
				tags: [tag],
			},
		});
		expect(created.ok(), await created.text()).toBe(true);
		campaignId = (await created.json()).id;
		const campaignPath = `/api/data/newsletter/campaigns/${campaignId}`;
		const sent = await request.post(`${campaignPath}/send`, {
			headers,
			data: {},
		});
		expect(sent.ok(), await sent.text()).toBe(true);
		expect((await request.get(`${campaignPath}/recovery`)).status()).toBe(401);
		const recovery = await request.get(`${campaignPath}/recovery`, { headers });
		expect(recovery.ok(), await recovery.text()).toBe(true);
		const initial = await recovery.json();
		expect(initial.counts).toMatchObject({ delivered: 1, uncertain: 1 });
		for (const recipient of initial.items) {
			expect(recipient).not.toHaveProperty("trackingToken");
			expect(recipient).not.toHaveProperty("unsubscribeToken");
		}

		await page.goto(`/pages/newsletter/campaigns/${campaignId}`);
		await waitForTanStackHydration(page);
		const panel = page.getByRole("region", { name: "Campaign recovery" });
		await expect(
			panel.getByRole("heading", { name: "Delivery recovery" }),
		).toBeVisible();
		await expect(
			panel.getByText(uncertainEmail, { exact: true }),
		).toBeVisible();
		await panel
			.getByRole("button", { name: "Resume eligible recipients" })
			.click();
		await expect(panel.getByRole("status")).toContainText("Resume completed");
		const unchanged = await request.get(`${campaignPath}/recovery`, {
			headers,
		});
		const protectedOutcomes = await unchanged.json();
		expect(protectedOutcomes.counts).toMatchObject({
			delivered: 1,
			uncertain: 1,
		});
		for (const recipient of protectedOutcomes.items)
			expect(recipient.attemptCount).toBe(1);
		await panel
			.getByRole("button", { name: "Check provider receipts" })
			.click();
		await expect(panel.getByRole("status")).toContainText(
			"Provider receipts checked",
		);
		await panel
			.getByRole("button", { name: `Resolve ${uncertainEmail}`, exact: true })
			.click();
		const dialog = page.getByRole("alertdialog", {
			name: "Resolve recipient outcome",
		});
		await expect(
			dialog.getByRole("button", { name: "Confirm resolution" }),
		).toBeDisabled();
		await dialog.getByLabel("Verified outcome").selectOption("failed");
		await dialog.getByRole("button", { name: "Confirm resolution" }).click();
		await expect(
			panel.getByText("Ready for eligible retry", { exact: true }),
		).toBeVisible();
		await panel
			.getByRole("button", { name: "Resume eligible recipients" })
			.click();
		await expect(panel.getByRole("status")).toContainText("Resume completed");
		await expect(
			panel.getByText("No failed or uncertain recipients need review.", {
				exact: true,
			}),
		).toBeVisible();
		const final = await request.get(`${campaignPath}/recovery`, { headers });
		const outcomes = await final.json();
		expect(outcomes.counts).toMatchObject({
			delivered: 2,
			uncertain: 0,
			failed: 0,
		});
		expect(
			outcomes.items.find(
				(item: { email: string }) => item.email === uncertainEmail,
			),
		).toMatchObject({ status: "delivered", attemptCount: 2 });
		expect(
			outcomes.items.find(
				(item: { email: string }) => item.email !== uncertainEmail,
			),
		).toMatchObject({ status: "delivered", attemptCount: 1 });
	} finally {
		if (campaignId)
			await request.delete(`/api/data/newsletter/campaigns/${campaignId}`, {
				headers,
			});
		for (const subscriberId of subscriberIds)
			await request.delete(`/api/data/newsletter/subscribers/${subscriberId}`, {
				headers,
			});
	}
});
