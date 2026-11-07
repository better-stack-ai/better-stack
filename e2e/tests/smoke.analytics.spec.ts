import { expect, test } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

const browserAgent =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

test.use({ userAgent: browserAgent });

test("analytics accepts anonymous events and protects its dashboard and export", async ({
	page,
	request,
}, testInfo) => {
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
	const autoView = page.waitForResponse(
		(response) =>
			response.url().endsWith("/analytics/pageviews") &&
			response.request().method() === "POST",
	);
	await page.goto("/pages/todos");
	expect(await (await autoView).json()).toMatchObject({ accepted: true });
	const trackedPage = await request.get(
		"/api/data/analytics/dashboard?range=today&path=%2Fpages%2Ftodos",
		{ headers: mockAuthHeaders() },
	);
	expect(trackedPage.ok(), await trackedPage.text()).toBe(true);
	expect((await trackedPage.json()).pageViews).toBeGreaterThanOrEqual(1);
	if (testInfo.project.name.startsWith("nextjs")) {
		const staticView = page.waitForResponse(
			(response) =>
				response.url().endsWith("/analytics/pageviews") &&
				response.request().method() === "POST",
		);
		await page.goto("/pages/ssg-blog");
		expect(await (await staticView).json()).toMatchObject({ accepted: true });
		const trackedStaticPage = await request.get(
			"/api/data/analytics/dashboard?range=today&path=%2Fpages%2Fssg-blog",
			{ headers: mockAuthHeaders() },
		);
		expect(trackedStaticPage.ok(), await trackedStaticPage.text()).toBe(true);
		expect((await trackedStaticPage.json()).pageViews).toBeGreaterThanOrEqual(
			1,
		);
	}
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

test("analytics funnels report ordered sessions and export the configured steps", async ({
	page,
	request,
}) => {
	const suffix = Date.now();
	const path = `/funnel-smoke-${suffix}`;
	const checkout = `checkout_${suffix}`;
	const purchase = `purchase_${suffix}`;
	const definition = {
		range: "today",
		windowMinutes: 30,
		steps: [
			{ type: "pageview", path, match: "exact" },
			{ type: "event", name: checkout },
			{ type: "event", name: purchase },
		],
	};
	for (const endpoint of ["funnel", "funnel/export"]) {
		const denied = await request.post(`/api/data/analytics/${endpoint}`, {
			data: definition,
		});
		expect([401, 403]).toContain(denied.status());
	}
	for (let index = 0; index < 3; index++) {
		const sessionId = `funnel-smoke-${suffix}-session-${index}`;
		for (const [endpoint, data] of [
			["pageviews", { path, sessionId }],
			...(index < 2 ? [["events", { path, sessionId, name: checkout }]] : []),
			...(index === 0 ? [["events", { path, sessionId, name: purchase }]] : []),
		] as const) {
			const recorded = await request.post(`/api/data/analytics/${endpoint}`, {
				headers: { "user-agent": browserAgent },
				data,
			});
			expect(recorded.ok(), await recorded.text()).toBe(true);
		}
	}
	const response = await request.post("/api/data/analytics/funnel", {
		headers: mockAuthHeaders(),
		data: definition,
	});
	expect(response.ok(), await response.text()).toBe(true);
	const funnel = await response.json();
	expect(funnel).toMatchObject({ totalSessions: 3, convertedSessions: 1 });
	expect(
		funnel.steps.map((step: { sessions: number }) => step.sessions),
	).toEqual([3, 2, 1]);
	await setMockAuthCookie(page.context());
	await page.goto("/pages/analytics");
	await page.getByRole("button", { name: "Today", exact: true }).click();
	const section = page.getByRole("region", { name: "Conversion funnel" });
	await section.getByLabel("Path", { exact: true }).fill(path);
	await section.getByLabel("Event name", { exact: true }).fill(checkout);
	await section.getByRole("button", { name: "Add step", exact: true }).click();
	await section.getByLabel("Event name", { exact: true }).nth(1).fill(purchase);
	await section
		.getByRole("button", { name: "Run funnel", exact: true })
		.click();
	await expect(section.getByText("1 of 3", { exact: true })).toBeVisible();
	await expect(section.getByText(/33\.3% conversion/)).toBeVisible();
	const downloaded = page.waitForEvent("download");
	await section
		.getByRole("button", { name: "Export funnel CSV", exact: true })
		.click();
	expect((await downloaded).suggestedFilename()).toBe("analytics-funnel.csv");
	const csv = await request.post("/api/data/analytics/funnel/export", {
		headers: mockAuthHeaders(),
		data: definition,
	});
	expect(csv.ok(), await csv.text()).toBe(true);
	const contents = await csv.text();
	expect(contents).toContain(path);
	expect(contents).toContain(checkout);
	expect(contents).toContain(purchase);
	expect(contents).not.toContain(`funnel-smoke-${suffix}-session`);
	await section.getByLabel("Path", { exact: true }).fill(`${path}-empty`);
	await section
		.getByRole("button", { name: "Run funnel", exact: true })
		.click();
	await expect(
		section.getByText("No sessions matched the first step in this range."),
	).toBeVisible();
});
