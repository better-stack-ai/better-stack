import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_PACKAGES, runPackedConsumerSmoke } from "./runner.mjs";
import {
	fixturesForShard,
	prepareCandidates,
	runShard,
	SHARD_COUNT,
} from "./ci.mjs";

vi.mock("./runner.mjs", async (importOriginal) => ({
	...(await importOriginal()),
	runPackedConsumerSmoke: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe("packed consumer CI", () => {
	it("covers every fixture exactly once across balanced shards", () => {
		const groups = Array.from({ length: SHARD_COUNT }, (_, index) =>
			fixturesForShard(index + 1),
		);
		expect(groups.flat().sort()).toEqual(Object.keys(FIXTURE_PACKAGES).sort());
		expect(
			Math.max(...groups.map((group) => group.length)) -
				Math.min(...groups.map((group) => group.length)),
		).toBeLessThanOrEqual(1);
		expect(() => fixturesForShard(0)).toThrow();
		expect(() => fixturesForShard(SHARD_COUNT + 1)).toThrow();
		expect(() => fixturesForShard(1.5)).toThrow();
	});

	it("runs every fixture for both installers using exact prepared artifacts", async () => {
		const reports = await mkdtemp(join(tmpdir(), "btst-shard-"));
		try {
			for (const packageManager of ["npm", "pnpm"]) {
				for (let shard = 1; shard <= SHARD_COUNT; shard++) {
					await runShard(shard, {
						packageManager,
						artifacts: "/prepared/packages",
						betterAuthUi: "/prepared/auth.tgz",
						sha: "a".repeat(40),
						reports,
					});
				}
			}
			const options = runPackedConsumerSmoke.mock.calls.map(
				([options]) => options,
			);
			expect(options).toHaveLength(Object.keys(FIXTURE_PACKAGES).length * 2);
			for (const fixture of Object.keys(FIXTURE_PACKAGES)) {
				expect(
					options
						.filter((option) => option.fixture === fixture)
						.map((option) => option.packageManager)
						.sort(),
				).toEqual(["npm", "pnpm"]);
			}
			expect(
				options.every(
					(option) =>
						option.artifacts === "/prepared/packages" &&
						option.sha === "a".repeat(40),
				),
			).toBe(true);
		} finally {
			await rm(reports, { recursive: true, force: true });
		}
	});

	it("continues after a failed fixture, saves its failure and fails the shard", async () => {
		const reports = await mkdtemp(join(tmpdir(), "btst-shard-failure-"));
		const fixtures = fixturesForShard(1);
		runPackedConsumerSmoke.mockRejectedValueOnce(
			new Error("Consumer typecheck failed"),
		);
		try {
			await expect(
				runShard(1, {
					packageManager: "npm",
					artifacts: "/prepared/packages",
					betterAuthUi: "/prepared/auth.tgz",
					sha: "a".repeat(40),
					reports,
				}),
			).rejects.toThrow(`Failed consumers: ${fixtures[0]}`);
			expect(runPackedConsumerSmoke).toHaveBeenCalledTimes(fixtures.length);
			expect(
				JSON.parse(
					await readFile(join(reports, `${fixtures[0]}-npm.json`), "utf8"),
				),
			).toMatchObject({
				fixture: fixtures[0],
				error: "Consumer typecheck failed",
				source: "a".repeat(40),
			});
		} finally {
			await rm(reports, { recursive: true, force: true });
		}
	});

	it("refuses to prepare artifacts for a different source commit", async () => {
		await expect(prepareCandidates("/unused", "0".repeat(40))).rejects.toThrow(
			"Candidate source differs",
		);
	});
});
