import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function verifyBrowser({ page, consumerDir }) {
	const plugin = join(consumerDir, "node_modules/@btst/plugin-cms/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/cms-hooks.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(plugin, "client/plugin.mjs"), "utf8"),
		/import\(/,
		"CMS pages remain deferred",
	);
	const assets = join(consumerDir, "dist/assets");
	const styles = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((name) => name.endsWith(".css"))
				.map((name) => readFile(join(assets, name), "utf8")),
		)
	).join("\n");
	assert.match(
		styles,
		/@source/,
		"CMS Tailwind scanning instructions survive CSS tree shaking",
	);
	await page
		.locator("#packed-cms")
		.filter({ hasText: "Packed articles" })
		.waitFor();
}
