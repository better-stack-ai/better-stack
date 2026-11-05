import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async function ({ page, consumerDir }) {
	await page.getByRole("heading", { name: "Find your next course" }).waitFor();
	await page
		.getByRole("heading", { name: "Useful types", exact: true })
		.waitFor();
	assert.equal(
		await page.locator(".school-lesson-content strong").textContent(),
		"useful types",
	);
	const search = page.getByPlaceholder("Search courses");
	await search.fill("missing");
	await page
		.getByText("No courses match these filters.", { exact: false })
		.waitFor();
	await search.fill("Packed");
	await page.locator(".school-course").waitFor();
	await page.getByRole("button", { name: "Mark lesson complete" }).click();
	await page.getByText("Completed", { exact: true }).waitFor();
	await page.reload();
	await page.getByText("Completed", { exact: true }).waitFor();
	assert.equal(
		await page
			.locator(".school-shell")
			.first()
			.evaluate((node) => getComputedStyle(node).paddingTop),
		"24px",
	);
	const dist = join(consumerDir, "node_modules/@btst/plugin-school/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
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
	assert.match(css, /school-shell/);
}
