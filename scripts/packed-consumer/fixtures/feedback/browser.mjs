import { build } from "vite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async function ({ page, consumerDir }) {
	process.env.FEEDBACK_CJS = "1";
	await build({ root: consumerDir });
	process.env.FEEDBACK_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		const url = new URL(path, page.url());
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "Feature requests", exact: true })
			.waitFor();
		await page
			.getByRole("button", { name: "Vote for Packed feedback", exact: true })
			.click();
		await page
			.getByRole("button", {
				name: "Remove vote for Packed feedback",
				exact: true,
			})
			.waitFor();
		assert.equal(
			await page.evaluate(() => localStorage.getItem("feedback-vote")),
			"9",
		);
		await page.getByLabel("Filter by category", { exact: true }).fill("Other");
		await page.getByText("No feature requests match these filters.").waitFor();
		url.search = "?mode=detail";
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "Packed feedback", exact: true })
			.waitFor();
		await page.getByText("Application discussion slot").waitFor();
		url.search = "?mode=roadmap";
		await page.goto(url.href);
		for (const name of ["Planned", "In Progress", "Shipped"])
			await page.getByRole("heading", { name, exact: true }).waitFor();
		await page
			.getByRole("link", { name: "Packed feedback", exact: true })
			.waitFor();
		url.search = "?mode=changelog";
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "Packed release", exact: true })
			.waitFor();
		assert.equal(
			await page
				.getByRole("link", { name: "Packed feedback", exact: true })
				.getAttribute("href"),
			"/pages/feedback/packed-feedback",
		);
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-feedback/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	const css = await readFile(join(dist, "style.css"), "utf8");
	assert.match(css, /@source "\.\/\*\*\/\*\.\{mjs,cjs\}"/);
	assert.doesNotMatch(css, /@workspace|\.\.\/\.\.\//);
	const files = await readdir(join(consumerDir, "dist/assets"));
	assert.ok(files.filter((name) => name.endsWith(".js")).length > 1);
}
