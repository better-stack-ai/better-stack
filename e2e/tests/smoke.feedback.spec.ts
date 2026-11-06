import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";
import { waitForTanStackHydration } from "./helpers/hydration";

test("feedback submits and toggles votes, then publishes a shipped request", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const title = `Export saved views ${suffix}`;
	const category = `Reporting-${suffix}`;
	const release = `Reporting release ${suffix}`;

	expect((await request.get("/api/data/feedback/posts")).ok()).toBe(true);
	expect(
		(
			await request.post("/api/data/feedback/posts", {
				data: { title, body: "Export a saved view as CSV.", category },
			})
		).status(),
	).toBe(401);
	await page.goto("/pages/feedback");
	await waitForTanStackHydration(page);
	await expect(
		page.getByRole("heading", { name: "Feature requests", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Submit a request", exact: true }),
	).toHaveCount(0);

	await setMockAuthCookie(context, `member-feedback-${suffix}`);
	await page.reload();
	await page
		.getByRole("button", { name: "Submit a request", exact: true })
		.click();
	await page.getByLabel("Request title", { exact: true }).fill(title);
	await page
		.getByLabel("Description", { exact: true })
		.fill("Export a saved view as CSV.");
	await page.getByLabel("Category", { exact: true }).fill(category);
	await page
		.getByRole("button", { name: "Submit request", exact: true })
		.click();
	await expect(page.getByRole("status")).toContainText(
		"Feature request submitted",
	);
	await page.getByLabel("Filter by category", { exact: true }).fill(category);
	const card = page
		.getByTestId("feedback-post-card")
		.filter({ hasText: title });
	await expect(card).toBeVisible();
	await page
		.getByLabel("Filter by status", { exact: true })
		.selectOption("shipped");
	await expect(card).toHaveCount(0);
	await page
		.getByLabel("Filter by status", { exact: true })
		.selectOption("under_review");
	await expect(card).toBeVisible();
	await card
		.getByRole("button", { name: `Vote for ${title}`, exact: true })
		.click();
	await expect(
		card.getByRole("button", { name: `Remove vote for ${title}`, exact: true }),
	).toHaveText("1 vote");
	await card
		.getByRole("button", { name: `Remove vote for ${title}`, exact: true })
		.click();
	await expect(
		card.getByRole("button", { name: `Vote for ${title}`, exact: true }),
	).toHaveText("0 votes");
	await card.getByRole("link", { name: title, exact: true }).click();
	await expect(
		page.getByRole("heading", { name: title, exact: true, level: 1 }),
	).toBeVisible();
	const detailUrl = page.url();
	await expect(page.getByLabel("Request status", { exact: true })).toHaveCount(
		0,
	);
	const list = await request.get(
		`/api/data/feedback/posts?category=${encodeURIComponent(category)}`,
	);
	const post = (await list.json()).items.find(
		(item: { title: string }) => item.title === title,
	);
	expect(post).toBeTruthy();
	expect(
		(
			await request.put(`/api/data/feedback/posts/${post.id}/status`, {
				headers: mockAuthHeaders(`member-feedback-${suffix}`),
				data: { status: "shipped" },
			})
		).status(),
	).toBe(403);

	await setMockAuthCookie(context);
	await page.reload();
	await waitForTanStackHydration(page);
	await page
		.getByLabel("Request status", { exact: true })
		.selectOption("planned");
	await page
		.getByRole("button", { name: "Update status", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Update status", exact: true }),
	).toBeDisabled();
	await expect(
		page.locator("span").filter({ hasText: /^Planned$/ }),
	).toBeVisible();
	expect(await (await request.get("/pages/feedback/roadmap")).text()).toContain(
		title,
	);
	await page.getByRole("link", { name: "Roadmap", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Planned", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: title, exact: true }),
	).toBeVisible();
	await page.goto(detailUrl);
	await waitForTanStackHydration(page);
	await page
		.getByLabel("Request status", { exact: true })
		.selectOption("shipped");
	await page
		.getByRole("button", { name: "Update status", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Update status", exact: true }),
	).toBeDisabled();
	await expect(
		page.locator("span").filter({ hasText: /^Shipped$/ }),
	).toBeVisible();
	await page.getByRole("link", { name: "Changelog", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "Changelog", exact: true }),
	).toBeVisible();
	await page
		.getByRole("button", { name: "Write a release", exact: true })
		.click();
	await page.getByLabel("Release title", { exact: true }).fill(release);
	await page
		.getByLabel("Release notes", { exact: true })
		.fill("Saved views now support CSV exports.");
	await page.getByRole("checkbox", { name: title, exact: true }).check();
	await page
		.getByRole("button", { name: "Publish release", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: release, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: title, exact: true }),
	).toBeVisible();
	await context.clearCookies();
	await page.reload();
	await expect(
		page.getByRole("heading", { name: release, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Write a release", exact: true }),
	).toHaveCount(0);
	expect(
		await (await request.get("/pages/feedback/changelog")).text(),
	).toContain(release);
	await page.getByRole("link", { name: title, exact: true }).click();
	await expect(
		page.getByRole("heading", { name: title, exact: true, level: 1 }),
	).toBeVisible();
});
