import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";

export default async function ({ page, consumerDir }) {
	process.env.SEARCH_CJS = "1";
	await build({ root: consumerDir });
	process.env.SEARCH_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		await page.goto(new URL(path, page.url()).href);
		await page
			.getByRole("heading", { name: "Standalone Search", exact: true })
			.waitFor();
		await page.getByTestId("search-button").click();
		const dialog = page.getByRole("dialog");
		const input = dialog.getByTestId("search-input");
		await input.fill("packed");
		await dialog
			.getByTestId("search-result")
			.filter({ hasText: "Packed search guide" })
			.waitFor();
		assert.equal(await dialog.getByLabel("Source", { exact: true }).count(), 0);
		await input.press("ArrowDown");
		await input.press("Enter");
		await page.waitForFunction(
			() => localStorage.getItem("search-destination") === "/pages/guide",
		);
		await dialog.waitFor({ state: "hidden" });
		await page.getByTestId("search-button").click();
		await dialog.getByTestId("search-input").fill("does-not-exist");
		await dialog.getByText("No results found.", { exact: true }).waitFor();
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "hidden" });
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-search/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(
		await readFile(join(dist, "style.css"), "utf8"),
		/@source "\.\/\*\*\/\*\.\{mjs,cjs\}"/,
	);
}
