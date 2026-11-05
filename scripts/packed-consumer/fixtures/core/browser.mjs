import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default async function verify({ page, consumerDir }) {
	async function inspect() {
		await page.getByRole("heading", { name: "Packed" }).waitFor();
		await page
			.getByText("BTST packed core consumer", { exact: true })
			.waitFor();
		assert.equal(
			await page.getByTestId("query-context").textContent(),
			"Shared Core instance",
		);
		await page.getByRole("button", { name: "Update context" }).click();
		await page.getByText("Core context updated", { exact: true }).waitFor();
	}
	await inspect();
	execFileSync(
		process.execPath,
		[join(consumerDir, "node_modules/vite/bin/vite.js"), "build"],
		{
			cwd: consumerDir,
			env: { ...process.env, CORE_CJS: "1" },
			stdio: "pipe",
		},
	);
	await page.goto(new URL("/commonjs.html", page.url()).href);
	await inspect();
}
