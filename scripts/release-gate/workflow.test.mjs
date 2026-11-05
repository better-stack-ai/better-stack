import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { FIXTURE_PACKAGES } from "../packed-consumer/runner.mjs";

test("every packed consumer and installer is required by CI and the release gate", async () => {
	const workflow = await readFile(
		new URL("../../.github/workflows/packed-consumers.yml", import.meta.url),
		"utf8",
	);
	const fixtures = workflow
		.match(/fixture:\s*\[([^\]]+)\]/)[1]
		.split(",")
		.map((item) => item.trim().replaceAll(/["']/g, ""));
	assert.deepEqual(
		fixtures.toSorted(),
		Object.keys(FIXTURE_PACKAGES)
			.filter((name) => name !== "auth")
			.toSorted(),
	);
	const policy = JSON.parse(
		await readFile(
			new URL("../../.github/release-gate.json", import.meta.url),
			"utf8",
		),
	);
	const jobs = [...fixtures, "Auth + account"].flatMap((name) =>
		["npm", "pnpm"].map((manager) => `${name} (${manager})`),
	);
	assert.deepEqual(
		policy.workflows["packed-consumers.yml"].toSorted(),
		jobs.toSorted(),
	);
});
