import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function verifyBrowser({ page, consumerDir }) {
	const plugin = join(consumerDir, "node_modules/@btst/plugin-ui-builder/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/ui-builder-hooks.mjs"), "utf8"),
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
		"UI Builder scanning instructions survive CSS tree shaking",
	);
	await page.getByTestId("packed-renderer").first().waitFor();
	assert.equal(
		await page.getByTestId("packed-renderer").first().textContent(),
		"Rendered from packed UI Builder",
	);
	await page.getByTestId("page-builder-page").waitFor();
	await page.getByTestId("component-editor").waitFor();
	await page.getByRole("combobox").first().click();
	await page.getByRole("option", { name: "Draft", exact: true }).click();
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await page.waitForFunction(() => window.__uiSavedMessage);
	const data = await page.evaluate(() => window.__savedUIPage);
	assert.equal(data.status, "draft");
	assert.equal(JSON.parse(data.layers)[0].type, "FixtureText");
}
