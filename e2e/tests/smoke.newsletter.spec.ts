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
