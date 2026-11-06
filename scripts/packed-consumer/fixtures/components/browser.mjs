import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function verifyBrowser({ page, consumerDir }) {
	const component = join(consumerDir, "node_modules/@btst/components/dist");
	const uiCss = await readFile(join(component, "ui.css"), "utf8");
	assert.match(uiCss, /@source "\.\/\*\*\/\*\.\{mjs,cjs\}"/);
	assert.doesNotMatch(uiCss, /milkdown|markdown-content|\{ts,tsx\}/);
	const themeColor = () =>
		page.evaluate(() => {
			const root = document.documentElement;
			const color = root.style.color;
			root.style.color = "var(--background)";
			const computed = getComputedStyle(root).color;
			root.style.color = color;
			return computed;
		});
	assert.equal(await themeColor(), "oklch(1 0 0)");
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	assert.equal(await themeColor(), "oklch(0.145 0 0)");
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	for (const path of [
		"auto-form/index",
		"auto-form/stepped-auto-form",
		"form-builder/index",
		"markdown-editor",
		"markdown-content",
		"multi-select",
		"search-select",
	]) {
		assert.match(
			await readFile(
				join(component, "ui/src/components", `${path}.mjs`),
				"utf8",
			),
			/^["']use client["']/,
		);
	}
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
	assert.match(css, /markdown-content/);
	assert.match(css, /milkdown/);
	assert.match(css, /@source/);
	assert.equal(
		await page.getByRole("heading", { name: "Packed reader" }).count(),
		1,
	);
	assert.equal(
		await page
			.locator("#reader h2")
			.evaluate((node) => getComputedStyle(node).fontSize),
		"36px",
	);
	assert.equal(
		await page
			.locator("#reader")
			.getByRole("link", { name: "Profile" })
			.getAttribute("target"),
		"_blank",
	);
	await page
		.locator("#form")
		.getByRole("button", { name: "Save standalone" })
		.click();
	await page.locator("#form").getByRole("alert").waitFor();
	await page
		.locator("#form")
		.getByRole("textbox", { name: "Title" })
		.fill("Standalone form");
	await page
		.locator("#form")
		.getByRole("button", { name: "Save standalone" })
		.click();
	await page
		.locator("#form output")
		.filter({ hasText: "Standalone form" })
		.waitFor();
	await page
		.locator("#steps")
		.getByRole("textbox", { name: /^First/ })
		.fill("Ada");
	await page
		.locator("#steps")
		.getByRole("button", { name: "Next", exact: true })
		.click();
	await page
		.locator("#steps")
		.getByRole("textbox", { name: /^Last/ })
		.fill("Lovelace");
	await page
		.locator("#steps")
		.getByRole("button", { name: "Submit", exact: true })
		.click();
	await page
		.locator("#steps output")
		.filter({ hasText: "Ada Lovelace" })
		.waitFor();
	await page
		.locator("#builder")
		.getByRole("textbox", { name: /^Message/ })
		.fill("Preview form");
	await page
		.locator("#builder")
		.getByRole("tab", { name: "JSON Schema" })
		.click();
	await page.locator("#builder pre").filter({ hasText: "message" }).waitFor();
	await page
		.locator("#editor .ProseMirror[contenteditable=true]")
		.fill("Updated standalone editor");
	await page
		.locator("#editor output")
		.filter({ hasText: "Updated standalone editor" })
		.waitFor();
	await page.locator("#multi input").fill("one");
	await page
		.locator("#multi")
		.getByRole("option", { name: "First choice", exact: true })
		.click();
	await page.locator("#multi output").filter({ hasText: "one" }).waitFor();
	await page.locator("#search").getByRole("combobox").press("Enter");
	await page.getByRole("option", { name: "Found option", exact: true }).click();
	await page.locator("#search output").filter({ hasText: "found" }).waitFor();
	await page.getByText("Standalone empty state", { exact: true }).waitFor();
	await page.goto(new URL("/commonjs.html", page.url()).href);
	await page.getByText("CommonJS empty state", { exact: true }).waitFor();
	await page.getByText("CommonJS reader", { exact: true }).waitFor();
	await page
		.locator("#commonjs")
		.getByRole("textbox", { name: /^Title/ })
		.fill("CommonJS form");
	await page.getByRole("button", { name: "Save CommonJS" }).click();
	await page
		.locator("#commonjs-submitted")
		.filter({ hasText: "CommonJS form" })
		.waitFor();
	await page
		.locator("#commonjs-editor .ProseMirror[contenteditable=true]")
		.fill("Edited CommonJS Markdown");
	await page
		.locator("#commonjs-editor output")
		.filter({ hasText: "Edited CommonJS Markdown" })
		.waitFor();
}
