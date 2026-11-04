import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async ({ page, consumerDir }) => {
	const plugin = join(consumerDir, "node_modules/@btst/plugin-media/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/use-media.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(plugin, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(await readFile(join(plugin, "style.css"), "utf8"), /@source/);
	const assets = join(consumerDir, "dist/assets");
	const styles = (
		await Promise.all(
			(
				await readdir(assets)
			)
				.filter((file) => file.endsWith(".css"))
				.map((file) => readFile(join(assets, file), "utf8")),
		)
	).join("\n");
	assert.match(
		styles,
		/@source/,
		"Imported Media styles remain in the production build",
	);
	await page.route("**/api/**", (route) =>
		route.fulfill({
			json: route.request().url().includes("/media/assets")
				? { items: [], total: 0 }
				: [],
		}),
	);
	await page.getByRole("button", { name: "Browse packed media" }).click();
	await page.getByRole("tab", { name: "URL" }).click();
	await page.getByPlaceholder("https://example.com/image.png").waitFor();
};
