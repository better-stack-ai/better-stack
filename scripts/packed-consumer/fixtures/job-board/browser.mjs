import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async ({ page, consumerDir }) => {
	await page
		.getByRole("heading", { name: "Packed role", exact: true })
		.waitFor();
	assert.equal(await page.locator("strong").textContent(), "useful software");
	assert.equal(await page.getByLabel("Your name").count(), 0);
	const structured = await page
		.locator('script[type="application/ld+json"]')
		.textContent();
	assert.equal(JSON.parse(structured).title, "Packed role");
	const url = new URL(page.url());
	url.searchParams.set("forms", "1");
	await page.goto(url.href);
	await page.getByLabel("Your name").fill("Ada");
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await page.getByText("Application received", { exact: true }).waitFor();
	const plugin = join(consumerDir, "node_modules/@btst/plugin-job-board/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(plugin, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	const assets = join(consumerDir, "dist/assets");
	const css = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((name) => name.endsWith(".css"))
				.map((name) => readFile(join(assets, name), "utf8")),
		)
	).join("\n");
	assert.match(
		css,
		/@source/,
		"Job Board CSS retains Tailwind scanning metadata",
	);
};
