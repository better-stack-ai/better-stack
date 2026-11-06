import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packCandidate } from "../pack-candidate.mjs";
import { candidatePackages } from "../release-gate/packages.mjs";
import { FIXTURE_PACKAGES } from "./runner.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SHARD_COUNT = 4;

export function fixturesForShard(shard) {
	assert(Number.isInteger(shard) && shard >= 1 && shard <= SHARD_COUNT);
	return Object.keys(FIXTURE_PACKAGES)
		.sort()
		.filter((_, index) => index % SHARD_COUNT === shard - 1);
}

export async function prepareCandidates(destination, sha) {
	const readGit = (...args) =>
		execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
	assert.equal(readGit("rev-parse", "HEAD"), sha, "Candidate source differs");
	const packages = candidatePackages(sha, readGit);
	const names = new Set([
		"@btst/stack",
		...Object.values(FIXTURE_PACKAGES).flat(),
	]);
	for (const name of names) {
		assert(packages.has(name), `Missing consumer package: ${name}`);
		await packCandidate({
			packageDir: resolve(ROOT, packages.get(name).path, ".."),
			destination,
			expectedSha: sha,
		});
	}
}

export async function runShard(shard, options) {
	await mkdir(options.reports, { recursive: true });
	const failures = [];
	for (const fixture of fixturesForShard(shard)) {
		console.log(`::group::${fixture} (${options.packageManager})`);
		const report = join(
			options.reports,
			`${fixture}-${options.packageManager}.json`,
		);
		try {
			// Vite and fixture modules mutate process-wide environment and module state.
			await new Promise((resolve, reject) => {
				const child = spawn(
					process.execPath,
					[
						join(ROOT, "scripts/packed-consumer-smoke.mjs"),
						"--fixture",
						fixture,
						"--package-manager",
						options.packageManager,
						"--artifacts",
						options.artifacts,
						"--better-auth-ui",
						options.betterAuthUi,
						"--sha",
						options.sha,
						"--report",
						report,
					],
					{ stdio: "inherit" },
				);
				child.once("error", reject);
				child.once("close", (code, signal) =>
					code === 0
						? resolve()
						: reject(new Error(`Consumer process failed: ${code ?? signal}`)),
				);
			});
		} catch (error) {
			failures.push(fixture);
			console.error(error);
			await writeFile(
				report,
				`${JSON.stringify(
					{
						fixture,
						packageManager: options.packageManager,
						source: options.sha,
						error: error.message,
					},
					null,
					2,
				)}\n`,
			);
		} finally {
			console.log("::endgroup::");
		}
	}
	assert.equal(failures.length, 0, `Failed consumers: ${failures.join(", ")}`);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const [command, ...args] = process.argv.slice(2);
	if (command === "prepare") {
		const [destination, sha] = args;
		await prepareCandidates(destination, sha);
	} else {
		assert.equal(command, "shard", "Expected prepare or shard");
		const [shard, packageManager, artifacts, betterAuthUi, sha, reports] = args;
		await runShard(Number(shard), {
			packageManager,
			artifacts,
			betterAuthUi,
			sha,
			reports,
		});
	}
}
