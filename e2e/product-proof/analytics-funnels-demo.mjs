import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const path = "/products/field-notebook";
const browserAgent =
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const browserErrors = [];

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../test-results/analytics-funnels-proof", import.meta.url),
	),
	videoName: "analytics-funnels",
	viewport: { width: 1440, height: 1000 },
	captionHold: 2800,
	captionStyle: { accent: "#475569" },
	async signIn({ context, baseURL }) {
		context.on("page", (page) => {
			page.on("pageerror", (error) => browserErrors.push(error.message));
		});
		for (let index = 0; index < 3; index++) {
			const sessionId = `analytics-funnel-demo385-session-${index}`;
			const records = [
				["pageviews", { path, sessionId }],
				...(index < 2
					? [["events", { path, sessionId, name: "checkout_started" }]]
					: []),
				...(index === 0
					? [["events", { path, sessionId, name: "purchase" }]]
					: []),
			];
			for (const [endpoint, body] of records) {
				const response = await fetch(
					`${baseURL}/api/data/analytics/${endpoint}`,
					{
						method: "POST",
						headers: {
							"content-type": "application/json",
							"user-agent": browserAgent,
						},
						body: JSON.stringify(body),
					},
				);
				assert.ok(response.ok, `${endpoint}: ${response.status}`);
				assert.equal((await response.json()).accepted, true);
			}
		}
		await context.addCookies([
			{
				name: "btst.example_session",
				value: "mock-session-admin-e2e",
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
	},
};

export const beats = [
	{
		name: "configure ordered steps",
		async run({ page, goto, caption }) {
			await goto("/pages/analytics");
			await page.getByRole("button", { name: "Today", exact: true }).click();
			const section = page.getByRole("region", { name: "Conversion funnel" });
			await section.getByLabel("Path", { exact: true }).fill(path);
			await section
				.getByLabel("Event name", { exact: true })
				.fill("checkout_started");
			await section
				.getByRole("button", { name: "Add step", exact: true })
				.click();
			await section
				.getByLabel("Event name", { exact: true })
				.nth(1)
				.fill("purchase");
			await section.scrollIntoViewIfNeeded();
			await caption(
				"Measure a product view, checkout and purchase in order within 30 minutes.",
			);
		},
	},
	{
		name: "session conversion and drop-off",
		async run({ page, caption }) {
			const section = page.getByRole("region", { name: "Conversion funnel" });
			await section
				.getByRole("button", { name: "Run funnel", exact: true })
				.click();
			await section.getByText("1 of 3", { exact: true }).waitFor();
			await section.getByText(/33\.3% conversion/).waitFor();
			await section.scrollIntoViewIfNeeded();
			await caption(
				"Three sessions entered; two reached checkout and one completed the purchase.",
			);
		},
	},
	{
		name: "export funnel metrics",
		async run({ page, caption }) {
			const section = page.getByRole("region", { name: "Conversion funnel" });
			const downloaded = page.waitForEvent("download");
			await section
				.getByRole("button", { name: "Export funnel CSV", exact: true })
				.click();
			assert.equal(
				(await downloaded).suggestedFilename(),
				"analytics-funnel.csv",
			);
			await caption(
				"Export the same aggregate step counts and drop-off without session identifiers.",
			);
			assert.deepEqual(browserErrors, []);
		},
	},
];
