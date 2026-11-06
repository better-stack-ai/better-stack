import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export default async function ({ page, consumerDir }) {
	await page
		.getByRole("heading", { name: "My support tickets", exact: true })
		.waitFor();
	await page
		.getByRole("link", { name: "Packed support request", exact: true })
		.waitFor();
	assert.equal(
		await page.getByRole("link", { name: "Agent inbox", exact: true }).count(),
		0,
	);
	const dist = join(consumerDir, "node_modules/@btst/plugin-helpdesk/dist");
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
