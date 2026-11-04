import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function verifyBrowser({ page, consumerDir }) {
	const pluginDist = join(
		consumerDir,
		"node_modules/@btst/plugin-ai-chat/dist",
	);
	const context = await readFile(
		join(pluginDist, "client/context/page-ai-context.mjs"),
		"utf8",
	);
	assert.match(context, /^["']use client["']/);
	const pageModule = await readFile(
		join(pluginDist, "client/components/pages/chat-page.mjs"),
		"utf8",
	);
	assert.match(
		pageModule,
		/import\(/,
		"Chat pages must remain deferred modules",
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
	assert.match(styles, /\.markdown-content/);
	assert.match(styles, /\.hljs/);

	await page
		.locator("#packed-context")
		.filter({ hasText: "Shared packed page context" })
		.waitFor();
	assert.ok(
		await page.locator("button").count(),
		"The packaged chat widget renders",
	);
}
