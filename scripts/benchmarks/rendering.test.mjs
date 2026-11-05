import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const command = fileURLToPath(
	new URL("./summarize-rendering.mjs", import.meta.url),
);
const complete = [];
for (const variant of ["v5", "v6"])
	for (const route of ["core", "reader", "editor", "multi"]) {
		for (const cache of ["cold", "warm"])
			complete.push({
				variant,
				route,
				cache,
				repetition: 0,
				warmup: false,
				ttfbMs: 0,
				fcpMs: 100,
				lcpMs: 100,
				cls: 0,
				contentVisibleMs: 100,
				shellHydrationMs: 100,
				routeReadyMs: 100,
				counterFrameReadyMs: 10,
				...(route === "editor" ? { editorInputFrameReadyMs: 10 } : {}),
				jsTransferBytes: 1000,
				cssTransferBytes: 100,
			});
		if (route !== "core")
			complete.push({
				variant,
				route,
				cache: "navigation",
				repetition: 0,
				warmup: false,
				navigationFrameReadyMs: 100,
			});
	}

async function summarize(samples, state, verify) {
	const directory = await mkdtemp(join(tmpdir(), "btst-rendering-report-"));
	try {
		await writeFile(join(directory, "samples.json"), JSON.stringify(samples));
		await writeFile(
			join(directory, "metadata.json"),
			JSON.stringify({
				state,
				failures: [],
				repetitions: 1,
				node: "test",
				chromium: "test",
			}),
		);
		const result = spawnSync(process.execPath, [command, directory], {
			encoding: "utf8",
		});
		await verify(result, directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test("preflight failures and empty observations cannot produce a successful report", async () => {
	for (const state of ["failed", "completed", "aborted"])
		await summarize([], state, (result) => assert.notEqual(result.status, 0));
});

test("report rejects a missing route and an absent measured value", async () => {
	await summarize(complete.slice(1), "completed", (result) =>
		assert.notEqual(result.status, 0),
	);
	await summarize(
		complete.map((row, index) => (index ? row : { ...row, lcpMs: null })),
		"completed",
		(result) => assert.notEqual(result.status, 0),
	);
});

test("a complete paired grid produces finite reports when a baseline median is zero", async () => {
	await summarize(complete, "completed", async (result, directory) => {
		assert.equal(result.status, 0, result.stderr);
		const report = await readFile(join(directory, "report.md"), "utf8");
		assert.doesNotMatch(report, /NaN|Infinity/);
		const rows = JSON.parse(
			await readFile(join(directory, "summary.json"), "utf8"),
		);
		assert(rows.length > 0);
		assert(
			rows
				.filter((row) => row.metric === "ttfbMs")
				.every((row) => row.pairedMedianDeltaPercent === null),
		);
	});
});
