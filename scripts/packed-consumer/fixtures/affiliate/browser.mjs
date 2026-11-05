import { build } from "vite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async function ({ page, consumerDir }) {
	process.env.AFFILIATE_CJS = "1";
	await build({ root: consumerDir });
	process.env.AFFILIATE_CJS = "0";
	for (const url of ["/", "/commonjs.html"]) {
		await page.goto(new URL(url, page.url()).href);
		await page.getByRole("heading", { name: "Become an affiliate" }).waitFor();
		assert.equal(
			await page.getByLabel("Name", { exact: true }).inputValue(),
			"Jane",
		);
		await page
			.getByLabel("Referral code", { exact: false })
			.fill("packed-jane");
		await page.getByRole("button", { name: "Submit application" }).click();
		await page
			.getByRole("heading", { name: "Your application is pending review" })
			.waitFor();
		assert.equal(
			await page
				.getByRole("link", { name: "Open affiliate portal" })
				.getAttribute("href"),
			"/pages/affiliate/portal",
		);
		assert.equal(
			JSON.parse(
				await page.evaluate(() =>
					localStorage.getItem("packed-affiliate-application"),
				),
			).code,
			"packed-jane",
		);
		assert.equal(
			await page
				.locator(".affiliate-page")
				.evaluate((node) => getComputedStyle(node).paddingTop),
			"32px",
		);
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-affiliate/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	const assets = join(consumerDir, "dist/assets");
	assert.ok(
		(await readdir(assets)).filter((name) => name.endsWith(".js")).length > 1,
	);
	const css = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((n) => n.endsWith(".css"))
				.map((n) => readFile(join(assets, n), "utf8")),
		)
	).join("\n");
	assert.match(css, /affiliate-form-grid/);
}
