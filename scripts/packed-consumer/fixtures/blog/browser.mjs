import { build } from "vite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async function verifyBrowser({ page, consumerDir }) {
	process.env.BLOG_CJS = "1";
	await build({ root: consumerDir });
	delete process.env.BLOG_CJS;
	const dist = join(consumerDir, "node_modules/@btst/plugin-blog/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/blog-hooks.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(
		await readFile(
			join(dist, "client/components/forms/post-forms.mjs"),
			"utf8",
		),
		/import\(/,
	);
	const styles = (
		await Promise.all(
			(
				await readdir(join(consumerDir, "dist/assets"))
			)
				.filter((n) => n.endsWith(".css"))
				.map((n) => readFile(join(consumerDir, "dist/assets", n), "utf8")),
		)
	).join("\n");
	assert.match(styles, /@source/);
	assert.match(styles, /milkdown/);
	assert.match(styles, /markdown-content/);
	for (const url of ["/", "/commonjs.html"]) {
		await page.goto(new URL(url, page.url()).href);
		await page
			.locator("#reader")
			.getByRole("heading", { name: "Reader heading", exact: true })
			.waitFor();
		await page.locator("#editor .ProseMirror[contenteditable=true]").waitFor();
		await page
			.locator("#editor")
			.getByPlaceholder("Enter your post title...")
			.fill("Browser draft");
		await page
			.locator("#editor")
			.getByPlaceholder("Brief summary of your post...")
			.fill("Browser excerpt");
		const editor = page.locator("#editor .ProseMirror[contenteditable=true]");
		await editor.click();
		await page.keyboard.type("Edited packed body");
		assert.match(await editor.innerText(), /Edited packed body/);
		await page
			.locator("#editor")
			.getByRole("button", { name: "Create Post", exact: true })
			.click();
		await page.waitForFunction(() =>
			document.body.dataset.submitted?.includes("Edited packed body"),
		);
	}
}
