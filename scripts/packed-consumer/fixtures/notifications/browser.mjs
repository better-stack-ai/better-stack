import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
export default async function ({ page, consumerDir }) {
	process.env.NOTIFICATIONS_CJS = "1";
	await build({ root: consumerDir });
	process.env.NOTIFICATIONS_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		await page.goto(new URL(path, page.url()).href);
		await page
			.getByRole("heading", { name: "Notifications", exact: true })
			.waitFor();
		await page.getByLabel("1 unread notifications").waitFor();
		await page
			.getByRole("button", { name: "Notifications", exact: true })
			.click();
		await page.getByRole("dialog", { name: "Recent notifications" }).waitFor();
		await page.keyboard.press("Escape");
		await page
			.getByRole("button", { name: "Mark all as read", exact: true })
			.click();
		await page
			.getByLabel("1 unread notifications")
			.waitFor({ state: "detached" });
		await page.getByRole("button", { name: "Archive", exact: true }).click();
		await page
			.getByText("Packed notification", { exact: true })
			.waitFor({ state: "detached" });
		const inApp = page.getByLabel("updates in-app notifications", {
			exact: true,
		});
		await inApp.uncheck();
		await page
			.getByRole("button", { name: "Save preferences", exact: true })
			.click();
		await page
			.getByRole("status")
			.filter({ hasText: "Preferences saved." })
			.waitFor();
		assert.equal(await inApp.isChecked(), false);
	}
	const dist = join(
		consumerDir,
		"node_modules/@btst/plugin-notifications/dist",
	);
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	assert.match(await readFile(join(dist, "style.css"), "utf8"), /@source/);
}
