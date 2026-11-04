import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function ({ page, consumerDir }) {
	await page.getByText("Packed column", { exact: true }).waitFor();
	await page.getByText("Packed task", { exact: true }).waitFor();
	assert.equal(await page.locator('[data-slot="kanban-column"]').count(), 1);
	assert.equal(await page.locator('[data-slot="kanban-item"]').count(), 1);
	assert.equal(
		await page
			.locator('[data-slot="kanban-board"]')
			.evaluate((node) => getComputedStyle(node).minHeight),
		"400px",
	);
	const dist = join(consumerDir, "node_modules/@btst/plugin-kanban/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/kanban-hooks.mjs"), "utf8"),
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
	assert.match(css, /kanban-board/);
	assert.match(css, /ProseMirror/);
}
