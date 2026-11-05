import { build } from "vite";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export default async function ({ page, consumerDir }) {
	process.env.CALENDAR_CJS = "1";
	await build({ root: consumerDir });
	process.env.CALENDAR_CJS = "0";
	for (const path of ["/", "/commonjs.html"]) {
		const url = new URL(path, page.url());
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "Packed consultation", exact: true })
			.waitFor();
		await page.getByLabel("Date", { exact: true }).fill("2035-01-01");
		await page
			.getByLabel("Timezone", { exact: true })
			.selectOption("America/New_York");
		await page.getByTestId("calendar-slot").click();
		await page.getByLabel("Your name", { exact: true }).fill("Packed Guest");
		await page.getByLabel("Email", { exact: true }).fill("guest@example.test");
		await page
			.getByRole("button", { name: "Confirm booking", exact: true })
			.click();
		await page.getByRole("heading", { name: "Booking confirmed" }).waitFor();
		assert.equal(
			await page
				.getByRole("link", { name: "Manage or cancel booking" })
				.getAttribute("href"),
			"/pages/calendar/cancel/packed-private-token",
		);
		assert.equal(
			JSON.parse(
				await page.evaluate(() =>
					localStorage.getItem("packed-calendar-booking"),
				),
			).timezone,
			"America/New_York",
		);
		url.search = "?mode=cancel";
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "Manage booking", exact: true })
			.waitFor();
		await page
			.getByRole("button", { name: "Cancel booking", exact: true })
			.click();
		await page
			.getByRole("heading", { name: "Booking cancelled", exact: true })
			.waitFor();
		assert.equal(
			await page.evaluate(() =>
				localStorage.getItem("packed-calendar-cancelled"),
			),
			"yes",
		);
		url.search = "?mode=editor";
		await page.goto(url.href);
		await page
			.getByRole("heading", { name: "New event type", exact: true })
			.waitFor();
		await page.getByLabel("Event name", { exact: true }).fill("Packed event");
		await page
			.getByLabel("Booking page slug", { exact: true })
			.fill("packed-event");
		await page
			.getByLabel("Host timezone", { exact: true })
			.fill("America/New_York");
		await page
			.getByRole("button", { name: "Add date override", exact: true })
			.click();
		await page.getByLabel("Override date", { exact: true }).fill("2035-01-02");
		await page
			.getByRole("button", { name: "Create event type", exact: true })
			.click();
		await page.waitForFunction(
			() =>
				JSON.parse(localStorage.getItem("packed-calendar-event") ?? "null")
					?.name === "Packed event",
		);
		const saved = JSON.parse(
			await page.evaluate(() => localStorage.getItem("packed-calendar-event")),
		);
		assert.equal(saved.timezone, "America/New_York");
		assert.deepEqual(saved.dateOverrides, [
			{ date: "2035-01-02", intervals: [] },
		]);
		assert.equal(saved.weeklyAvailability.length, 5);
	}
	const dist = join(consumerDir, "node_modules/@btst/plugin-calendar/dist");
	assert.match(
		await readFile(join(dist, "client/hooks/index.mjs"), "utf8"),
		/^["']use client["']/,
	);
	assert.match(
		await readFile(join(dist, "client/plugin.mjs"), "utf8"),
		/import\(/,
	);
	const stylesheet = await readFile(join(dist, "style.css"), "utf8");
	assert.match(stylesheet, /@source "\.\/\*\*\/\*\.\{mjs,cjs\}"/);
	assert.doesNotMatch(stylesheet, /@workspace|\.\.\/\.\.\//);
	const assets = join(consumerDir, "dist/assets");
	const files = await readdir(assets);
	assert.ok(files.filter((n) => n.endsWith(".js")).length > 1);
	const css = (
		await Promise.all(
			files
				.filter((n) => n.endsWith(".css"))
				.map((n) => readFile(join(assets, n), "utf8")),
		)
	).join("\n");
	assert.match(css, /@source/);
}
