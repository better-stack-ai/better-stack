import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async ({ page, consumerDir }) => {
	const drafts = [];
	await page.route("**/api/newsletter/campaigns", async (route) => {
		assert.equal(route.request().method(), "POST");
		const draft = route.request().postDataJSON();
		drafts.push(draft);
		await route.fulfill({
			json: {
				...draft,
				id: "packed-draft",
				status: "draft",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		});
	});
	await page.route("**/api/**/blog/**", () => {
		throw new Error("Standalone Newsletter requested Blog");
	});
	const plugin = join(consumerDir, "node_modules/@btst/plugin-newsletter/dist");
	assert.match(
		await readFile(join(plugin, "client/hooks/index.mjs"), "utf8"),
		/^['"]use client['"]/,
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
				.filter((f) => f.endsWith(".css"))
				.map((f) => readFile(join(assets, f), "utf8")),
		)
	).join("\n");
	assert.match(css, /@source/);
	assert.match(css, /milkdown/);
	for (const commonjs of [false, true]) {
		if (commonjs) await page.goto(new URL("/commonjs.html", page.url()).href);
		await page
			.getByLabel("Subject", { exact: true })
			.fill("Packed independent edition");
		await page
			.getByLabel("Email body", { exact: true })
			.fill(
				"# Packed preview\n\n**Strong** text and [unsafe](javascript:alert%281%29).\n\n<script>alert(1)</script>",
			);
		await page.getByRole("button", { name: "Preview", exact: true }).click();
		await page
			.getByRole("heading", { name: "Packed preview", exact: true })
			.waitFor();
		assert.equal(
			await page.locator('[aria-label="Email preview"] script').count(),
			0,
		);
		assert.equal(
			await page
				.locator('[aria-label="Email preview"] a[href^="javascript:"]')
				.count(),
			0,
		);
		await page.getByRole("button", { name: "Rich text", exact: true }).click();
		const editor = page.locator(
			'[aria-label="Email body rich text editor"] .ProseMirror[contenteditable=true]',
		);
		await editor.waitFor();
		await editor.fill("Edited in the packed rich text editor");
		await page.getByRole("button", { name: "Markdown", exact: true }).click();
		await page.getByLabel("Email body", { exact: true }).waitFor();
		assert.match(
			await page.getByLabel("Email body", { exact: true }).inputValue(),
			/Edited in the packed rich text editor/,
		);
		await page.getByRole("button", { name: "Save draft", exact: true }).click();
		assert.equal(
			await page
				.getByLabel("From name", { exact: true })
				.evaluate((input) => input.validity.valueMissing),
			true,
		);
		await page.getByLabel("From name", { exact: true }).fill("Packed editor");
		await page
			.getByLabel("From email", { exact: true })
			.fill("editor@example.test");
		await page.getByRole("button", { name: "Save draft", exact: true }).click();
		await page
			.getByRole("status")
			.filter({ hasText: "Campaign saved" })
			.waitFor();
		assert.equal(drafts.length, commonjs ? 2 : 1);
		assert.equal(drafts.at(-1).subject, "Packed independent edition");
		assert.match(drafts.at(-1).body, /Edited in the packed rich text editor/);
		assert.deepEqual(drafts.at(-1).tags, []);
	}
	const source = new URL("/", page.url());
	source.search = "source=1&fromPostSlug=source-edition&fromPostId=source-1";
	await page.goto(source.href);
	await page.getByText("Custom campaign source", { exact: true }).waitFor();
	assert.equal(
		await page.getByLabel("Subject", { exact: true }).inputValue(),
		"Optional source edition",
	);
	assert.equal(
		await page.getByLabel("Email body", { exact: true }).inputValue(),
		"# Optional source content",
	);
};
