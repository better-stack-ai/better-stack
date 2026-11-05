import { build } from "vite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function ({ page, consumerDir }) {
	process.env.ANALYTICS_CJS = "1";
	await build({ root: consumerDir });
	process.env.ANALYTICS_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		await page.goto(new URL(path, page.url()).href);
		await page.getByTestId("analytics-dashboard").waitFor();
		await page.getByText("existing_signup", { exact: true }).waitFor();
		assert.equal(
			await page
				.locator(".analytics-metrics > div")
				.nth(1)
				.locator("dd")
				.textContent(),
			"42",
		);
		assert.equal(
			await page
				.getByRole("heading", { name: "Analytics", exact: true })
				.evaluate((element) => getComputedStyle(element).fontSize),
			"28px",
		);
		await page.getByRole("button", { name: "Today", exact: true }).click();
		await page.waitForFunction(
			() =>
				document.querySelectorAll(".analytics-metrics dd")[1]?.textContent ===
				"7",
		);
		await page.getByRole("button", { name: "Export CSV", exact: true }).click();
		await page.waitForFunction(() =>
			window.packedAnalyticsRequests.some((r) => r.url.includes("/export")),
		);
		await page.evaluate(async () => {
			await window.packedAnalyticsTracker.pageView(
				"/pricing?secret=hidden#section",
			);
			await window.packedAnalyticsTracker.track("signup", { plan: "pro" });
		});
		const requests = await page.evaluate(() => window.packedAnalyticsRequests);
		for (const request of requests) {
			assert.match(request.url, /^https:\/\/site\.test\/api\/analytics\//);
			assert.equal(request.headers["x-public-client"], "analytics-fixture");
			assert.equal(request.headers.authorization, undefined);
			assert.equal(request.headers.cookie, undefined);
			assert.equal(request.credentials, "include");
		}
		const view = requests.find((r) => r.url.endsWith("/pageviews"));
		const event = requests.find((r) => r.url.endsWith("/events"));
		assert.equal(view.body.path, "/pricing");
		assert.match(view.body.sessionId, /^[a-f0-9]{32}$/);
		assert.equal(event.body.sessionId, view.body.sessionId);
		assert.equal(event.body.name, "signup");
		assert.deepEqual(
			await page.evaluate(() => [
				document.cookie,
				localStorage.length,
				sessionStorage.length,
			]),
			["", 0, 0],
		);
		await page.evaluate(async () => {
			Object.defineProperty(navigator, "doNotTrack", {
				configurable: true,
				value: "1",
			});
			window.packedAnalyticsDntResult =
				await window.packedAnalyticsTracker.track("must_not_send");
		});
		assert.equal(
			await page.evaluate(() => window.packedAnalyticsDntResult),
			false,
		);
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-analytics/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(
		await readFile(
			join(dist, "client/components/pages/dashboard-page.mjs"),
			"utf8",
		),
		/import\(/,
	);
	const assets = join(consumerDir, "dist/assets");
	const css = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((f) => f.endsWith(".css"))
				.map((f) => readFile(join(assets, f), "utf8")),
		)
	).join("\n");
	assert.match(css, /analytics-dashboard/);
	assert.match(css, /@source/);
}
