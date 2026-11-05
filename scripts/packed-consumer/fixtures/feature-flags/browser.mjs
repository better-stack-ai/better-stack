import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
export default async function ({ page, consumerDir }) {
	process.env.FEATURE_FLAGS_CJS = "1";
	await build({ root: consumerDir });
	process.env.FEATURE_FLAGS_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		await page.goto(new URL(path, page.url()).href);
		await page
			.getByRole("heading", { name: "New flag", exact: true })
			.waitFor();
		await page
			.getByRole("link", { name: "Existing checkout", exact: true })
			.waitFor();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="flag-value"]')?.textContent ===
				"true",
		);
		assert.equal(
			await page
				.getByRole("heading", { name: "Feature flags", exact: true })
				.evaluate((el) => getComputedStyle(el).fontSize),
			"28px",
		);
		await page
			.getByRole("switch", { name: "Enable Existing checkout", exact: true })
			.click();
		await page.waitForFunction(
			() =>
				document.querySelector('[data-testid="flag-value"]')?.textContent ===
				"false",
		);
		await page.getByLabel("Name", { exact: true }).fill("Packed beta flag");
		await page.getByLabel("Key", { exact: true }).fill("packed-beta");
		await page.getByLabel("Flag type", { exact: true }).selectOption("segment");
		await page
			.getByRole("button", { name: "Create flag", exact: true })
			.click();
		await page
			.getByRole("alert")
			.getByText("Add at least one targeting rule.", { exact: true })
			.waitFor();
		await page.getByRole("button", { name: "Add rule", exact: true }).click();
		await page
			.getByRole("group", { name: "Rule 1", exact: true })
			.getByRole("combobox")
			.first()
			.selectOption("tags");
		await page.getByLabel("Value", { exact: true }).fill("bêta");
		await page.getByLabel("Enable on creation", { exact: true }).check();
		await page
			.getByRole("button", { name: "Create flag", exact: true })
			.click();
		await page
			.getByRole("link", { name: "Packed beta flag", exact: true })
			.waitFor();
		const state = await page.evaluate(() => ({
			requests: window.packedFlagRequests,
			definitions: window.packedFlagDefinitions,
			navigations: window.packedFlagNavigations,
		}));
		const created = state.requests.find(
			(r) => r.method === "POST" && r.url.endsWith("/flags"),
		);
		assert.equal(created.body.key, "packed-beta");
		assert.deepEqual(created.body.segments, [
			{ field: "tags", operator: "contains", value: "bêta" },
		]);
		assert.equal(created.body.enabled, true);
		assert.ok(
			state.navigations.includes("https://site.test/pages/feature-flags") ||
				state.navigations.includes("/pages/feature-flags"),
		);
		assert.equal(
			state.definitions.find((f) => f.key === "checkout").id,
			"v5-flag",
		);
		for (const r of state.requests) {
			assert.match(r.url, /^https:\/\/site\.test\/api\/feature-flags\//);
			assert.equal(r.headers["x-public-client"], "flag-fixture");
			assert.equal(r.headers.authorization, undefined);
			assert.equal(r.headers.cookie, undefined);
			assert.equal(r.credentials, "include");
		}
		const evaluation = state.requests.find((r) =>
			r.url.includes("/evaluate/checkout"),
		);
		const encoded = new URL(evaluation.url).searchParams.get("context");
		assert.deepEqual(
			JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
			{ userId: "Zoë", tags: ["bêta"] },
		);
	}
	const dist = join(
		consumerDir,
		"node_modules/@btst/plugin-feature-flags/dist",
	);
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.doesNotMatch(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(
		await readFile(join(dist, "client/components/pages.mjs"), "utf8"),
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
	assert.match(css, /feature-flags-page/);
	assert.match(
		await readFile(join(dist, "style.css"), "utf8"),
		/@source "\.\/\*\*\/\*\.\{mjs,cjs\}"/,
	);
}
