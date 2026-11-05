import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export default async function ({ page, consumerDir }) {
	const errors = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	await page.reload();
	await page
		.getByRole("heading", { name: "Packed sales" })
		.waitFor({ timeout: 10000 })
		.catch((error) => {
			throw new Error(`${error.message}\n${errors.join("\n")}`);
		});
	const handle = page.getByRole("button", { name: "Move deal Packed deal" });
	await handle.waitFor();
	const lead = page
		.locator('[data-slot="kanban-column"]')
		.filter({ has: page.getByRole("heading", { name: "Lead", exact: true }) });
	const qualified = page.locator('[data-slot="kanban-column"]').filter({
		has: page.getByRole("heading", { name: "Qualified", exact: true }),
	});
	await handle.focus();
	await page.keyboard.press("Space");
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(resolve)),
			),
	);
	await page
		.getByRole("status")
		.filter({ hasText: /item/ })
		.waitFor({ state: "attached" });
	assert.equal(await handle.getAttribute("aria-pressed"), "true");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Escape");
	await page.waitForFunction(
		() =>
			document
				.querySelector('button[aria-label="Move deal Packed deal"]')
				?.getAttribute("aria-pressed") !== "true",
	);
	assert.notEqual(await handle.getAttribute("aria-pressed"), "true");
	await page.reload();
	await lead.getByRole("button", { name: "Move deal Packed deal" }).waitFor();
	let start = await handle.boundingBox();
	let target = await qualified.boundingBox();
	assert(start && target);
	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		start.x + start.width / 2 + 15,
		start.y + start.height / 2,
		{ steps: 4 },
	);
	await page.waitForFunction(
		() =>
			document
				.querySelector('button[aria-label="Move deal Packed deal"]')
				?.getAttribute("aria-pressed") === "true",
	);
	await page.mouse.move(target.x + target.width / 2, target.y + 100, {
		steps: 20,
	});
	await page.mouse.up();
	await qualified
		.getByRole("button", { name: "Move deal Packed deal" })
		.waitFor();
	await page
		.getByRole("status")
		.filter({ hasText: "Deal stage updated" })
		.waitFor();
	await page.reload();
	await qualified
		.getByRole("button", { name: "Move deal Packed deal" })
		.waitFor();
	start = await handle.boundingBox();
	target = await lead.boundingBox();
	assert(start && target);
	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		start.x + start.width / 2 + 15,
		start.y + start.height / 2,
		{ steps: 4 },
	);
	await page.waitForFunction(
		() =>
			document
				.querySelector('button[aria-label="Move deal Packed deal"]')
				?.getAttribute("aria-pressed") === "true",
	);
	await page.mouse.move(target.x + target.width / 2, target.y + 100, {
		steps: 20,
	});
	await page.mouse.up();
	await lead.getByRole("button", { name: "Move deal Packed deal" }).waitFor();
	await page
		.getByRole("status")
		.filter({ hasText: "Deal stage updated" })
		.waitFor();
	await page.reload();
	await lead.getByRole("button", { name: "Move deal Packed deal" }).waitFor();
	await page
		.getByRole("button", { name: "Search contacts", exact: true })
		.click();
	await page.getByText("Ada", { exact: true }).waitFor();
	await page.getByRole("button", { name: "New deal", exact: true }).click();
	assert.equal(
		await page
			.getByRole("textbox", { name: "Deal title" })
			.evaluate((node) => getComputedStyle(node).minHeight),
		"44px",
	);
	const dist = join(consumerDir, "node_modules/@btst/plugin-crm/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
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
	assert.match(css, /crm-page/);
}
