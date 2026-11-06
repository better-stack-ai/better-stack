import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";

export default async function ({ page, consumerDir }) {
	process.env.ROUTE_DOCS_CJS = "1";
	await build({ root: consumerDir });
	process.env.ROUTE_DOCS_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		await page.goto(new URL(path, page.url()).href);
		await page
			.getByRole("heading", { name: "Packed route documentation", exact: true })
			.waitFor();
		assert.deepEqual(
			JSON.parse(await page.getByTestId("registered-routes").textContent()),
			[{ path: "/catalog/:slug", plugin: "catalog", key: "item" }],
		);
		await page.getByText("v5-existing", { exact: false }).first().waitFor();
		const input = page.getByLabel(":slug", { exact: true });
		await input.fill("existing-book");
		await page.evaluate(() => {
			window.packedOpened = [];
			window.open = (...args) => {
				window.packedOpened.push(args);
				return null;
			};
		});
		await page.getByRole("button", { name: "Visit", exact: true }).click();
		assert.deepEqual(await page.evaluate(() => window.packedOpened), [
			[
				new URL("/pages/catalog/existing-book", page.url()).href,
				"_blank",
				"noopener,noreferrer",
			],
		]);
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-route-docs/dist");
	assert.match(
		await readFile(join(dist, "client/hooks.mjs"), "utf8"),
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
	assert.ok(
		(await readdir(join(consumerDir, "dist/assets"))).some((file) =>
			file.endsWith(".css"),
		),
	);
}
