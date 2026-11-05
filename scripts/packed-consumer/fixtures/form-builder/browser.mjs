import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function ({ page, consumerDir }) {
	await page.getByLabel("Your name").fill("Ada");
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await page.getByText("Packed submission accepted", { exact: true }).waitFor();
	const plugin = join(
		consumerDir,
		"node_modules/@btst/plugin-form-builder/dist",
	);
	assert.match(
		await readFile(join(plugin, "client/hooks/form-builder-hooks.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(plugin, "client/plugin.mjs"), "utf8"),
		/import\(/,
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
		"Form Builder Tailwind scanning survives CSS tree shaking",
	);
}
