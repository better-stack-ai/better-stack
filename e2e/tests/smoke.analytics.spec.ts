import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

const browserAgent =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

test.use({ userAgent: browserAgent });

test("analytics accepts anonymous events and protects its dashboard and export", async ({
	page,
	request,
}) => {
	const path = `/analytics-smoke-${Date.now()}`;
	const sessionId = `analytics-smoke-session-${Date.now()}`;
	const headers = { "user-agent": browserAgent };
	const denied = await request.get("/api/data/analytics/dashboard");
	expect([401, 403]).toContain(denied.status());
	const deniedExport = await request.get("/api/data/analytics/export");
	expect([401, 403]).toContain(deniedExport.status());

	const pageView = await request.post("/api/data/analytics/pageviews", {
		headers,
		data: {
			path,
			sessionId,
			referrer: "https://example.org/story?private=value",
		},
	});
	expect(pageView.ok(), await pageView.text()).toBe(true);
	const event = await request.post("/api/data/analytics/events", {
		headers,
		data: {
			path,
			sessionId,
			name: "analytics_smoke_clicked",
			properties: { label: "Smoke test" },
		},
	});
	expect(event.ok(), await event.text()).toBe(true);

	const stats = await request.get(
		`/api/data/analytics/dashboard?range=today&path=${encodeURIComponent(path)}`,
		{ headers: mockAuthHeaders() },
	);
	expect(stats.ok(), await stats.text()).toBe(true);
	const data = await stats.json();
	expect(data).toMatchObject({ pageViews: 1, uniqueVisitors: 1 });
	expect(data.topPages).toContainEqual(
		expect.objectContaining({ path, views: 1 }),
	);

	await setMockAuthCookie(page.context());
	const autoView = page.waitForResponse((response) => {
		if (!response.url().endsWith("/analytics/pageviews")) return false;
		return response.request().postDataJSON()?.path === "/pages/blog";
	});
	await page.goto("/pages/blog");
	expect(await (await autoView).json()).toMatchObject({ accepted: true });
	const initialStats = page.waitForResponse((response) =>
		response.url().includes("/analytics/dashboard?"),
	);
	await page.goto("/pages/analytics");
	expect((await initialStats).ok()).toBe(true);
	await expect(
		page.getByRole("heading", { name: "Analytics", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Top pages", exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("analytics_smoke_clicked", { exact: true }),
	).toBeVisible();
	for (const [label, range] of [
		["Today", "today"],
		["30 days", "30d"],
	]) {
		const changed = page.waitForResponse((response) => {
			const url = new URL(response.url());
			return (
				url.pathname.endsWith("/analytics/dashboard") &&
				url.searchParams.get("range") === range
			);
		});
		await page.getByRole("button", { name: label, exact: true }).click();
		expect((await changed).ok()).toBe(true);
	}
	await page.getByRole("button", { name: "Custom", exact: true }).click();
	await page.getByLabel("Start date", { exact: true }).fill("2000-01-01");
	await page.getByLabel("End date", { exact: true }).fill("2000-01-01");
	const customStats = page.waitForResponse((response) => {
		const url = new URL(response.url());
		return (
			url.pathname.endsWith("/analytics/dashboard") &&
			url.searchParams.get("range") === "custom" &&
			url.searchParams.get("start") === "2000-01-01"
		);
	});
	await page.getByRole("button", { name: "Apply dates", exact: true }).click();
	expect((await customStats).ok()).toBe(true);
	await expect(
		page.getByRole("heading", { name: "No page views in this range" }),
	).toBeVisible();
	await page.getByRole("button", { name: "7 days", exact: true }).click();
	await expect(
		page.getByText("analytics_smoke_clicked", { exact: true }),
	).toBeVisible();

	const downloaded = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export CSV", exact: true }).click();
	expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
	const csv = await request.get("/api/data/analytics/export?range=today", {
		headers: mockAuthHeaders(),
	});
	expect(csv.ok(), await csv.text()).toBe(true);
	const contents = await csv.text();
	expect(contents).toContain(path);
	expect(contents).toContain("analytics_smoke_clicked");
	expect(contents).not.toContain("private=value");
});
