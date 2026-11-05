import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export default async function ({ page, consumerDir }) {
	await page
		.getByTestId("comment-card")
		.filter({ hasText: "Existing v5 comment" })
		.waitFor();
	const pending = page
		.getByTestId("moderation-row")
		.filter({ hasText: "Queued for approval" });
	{
		await page.getByTestId("tab-pending").waitFor();
		await pending.waitFor();
		await pending.getByTestId("approve-button").click();
		await pending.waitFor({ state: "detached" });
	}
	const card = page.locator('[data-comment-id="v5-comment"]');
	await card.getByRole("button", { name: "Like", exact: true }).click();
	await card.getByRole("button", { name: "Unlike", exact: true }).waitFor();
	const input = page.getByPlaceholder("Write a comment…").first();
	await input.fill("Packed comment submission");
	await page.getByRole("button", { name: "Post comment", exact: true }).click();
	await page
		.getByText("Packed comment submission", { exact: true })
		.first()
		.waitFor();
	await page.reload();
	await page.getByTestId("moderation-page").waitFor();
	assert.equal(
		await page
			.getByTestId("moderation-row")
			.filter({ hasText: "Queued for approval" })
			.count(),
		0,
	);
	const requests = await page.evaluate(() =>
		window.packedCommentsRequests.map((r) => ({
			url: r.url,
			method: r.method,
			authorization: r.headers.get("authorization"),
			cookie: r.headers.get("cookie"),
			publicClient: r.headers.get("x-public-client"),
		})),
	);
	assert.ok(requests.length > 0);
	for (const request of requests) {
		assert.match(request.url, /^https:\/\/example.test\/api\/comments/);
		assert.equal(request.authorization, null);
		assert.equal(request.cookie, null);
		assert.equal(request.publicClient, "comments-fixture");
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-comments/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/use-comments.mjs"), "utf8"),
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
	assert.match(
		await readFile(join(dist, "client.css"), "utf8"),
		/Comments Plugin Client CSS/,
	);
}
