import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { FIXTURE_PACKAGES } from "../packed-consumer/runner.mjs";
import { fixturesForShard, SHARD_COUNT } from "../packed-consumer/ci.mjs";

test("every packed consumer and installer is required by CI and the release gate", async () => {
	const workflow = await readFile(
		new URL("../../.github/workflows/packed-consumers.yml", import.meta.url),
		"utf8",
	);
	const shards = workflow
		.match(/shard:\s*\[([^\]]+)\]/)[1]
		.split(",")
		.map(Number);
	assert.deepEqual(
		shards,
		Array.from({ length: SHARD_COUNT }, (_, index) => index + 1),
	);
	const fixtures = shards.flatMap(fixturesForShard);
	assert.deepEqual(
		fixtures.toSorted(),
		Object.keys(FIXTURE_PACKAGES).toSorted(),
	);
	const policy = JSON.parse(
		await readFile(
			new URL("../../.github/release-gate.json", import.meta.url),
			"utf8",
		),
	);
	const managers = workflow
		.match(/package-manager:\s*\[([^\]]+)\]/)[1]
		.split(",")
		.map((name) => name.trim());
	assert.deepEqual(managers, ["npm", "pnpm"]);
	const jobs = [
		"Prepare consumer archives",
		...shards.flatMap((shard) =>
			managers.map((manager) => `Consumers ${shard} (${manager})`),
		),
	];
	assert.deepEqual(
		policy.workflows["packed-consumers.yml"].toSorted(),
		jobs.toSorted(),
	);
});
