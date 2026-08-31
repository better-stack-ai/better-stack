import assert from "node:assert/strict";
import { test } from "node:test";

import {
	AUTH_COHORT,
	assertAuthCohort,
	assertHealthyDependencyTree,
	createConsumerManifest,
	findMissingDirectPeers,
	parseArgs,
} from "./runner.mjs";

test("parses one explicit fixture and package manager", () => {
	assert.deepEqual(
		parseArgs(["--fixture", "core", "--package-manager", "pnpm"]),
		{
			fixture: "core",
			packageManager: "pnpm",
			betterAuthUi: undefined,
			keepTemp: false,
		},
	);
});

test("accepts the package-runner argument separator", () => {
	assert.equal(
		parseArgs(["--", "--fixture", "core", "--package-manager", "npm"])
			.packageManager,
		"npm",
	);
});

test("requires an injected Better Auth UI artifact for the auth fixture", () => {
	assert.throws(
		() => parseArgs(["--fixture", "auth", "--package-manager", "npm"]),
		/--better-auth-ui <tarball-or-package-spec>/,
	);
});

test("rejects missing and invalid dependency-tree entries", () => {
	assert.throws(
		() =>
			assertHealthyDependencyTree({
				name: "consumer",
				problems: ["missing: better-call@1.3.6"],
				dependencies: {
					"better-call": { version: "2.0.2", invalid: true },
				},
			}),
		/missing: better-call@1\.3\.6.*better-call@2\.0\.2 is invalid/s,
	);
});

test("finds non-optional peers that are not direct consumer dependencies", () => {
	assert.deepEqual(
		findMissingDirectPeers(
			{
				peerDependencies: {
					react: ">=18",
					next: ">=15",
					"better-call": "1.3.6",
				},
				peerDependenciesMeta: { next: { optional: true } },
			},
			{ dependencies: { react: "19.2.7" } },
		),
		["better-call@1.3.6"],
	);
});

test("accepts exactly one retained Better Auth dependency universe", () => {
	const versions = Object.fromEntries(
		Object.entries(AUTH_COHORT).map(([name, version]) => [name, [version]]),
	);

	assert.doesNotThrow(() => assertAuthCohort(versions));
	assert.throws(
		() =>
			assertAuthCohort({
				...versions,
				"better-call": ["1.3.6", "2.0.2"],
			}),
		/better-call: expected only 1\.3\.6; found 1\.3\.6, 2\.0\.2/,
	);
});

test("the core consumer directly satisfies the published DB auth peers", () => {
	const manifest = createConsumerManifest({
		fixture: "core",
		stackTarball: "/tmp/stack.tgz",
	});

	assert.equal(manifest.dependencies["@better-auth/core"], "1.6.16");
	assert.equal(manifest.dependencies["@better-auth/utils"], "0.4.1");
	assert.equal(manifest.dependencies["@better-fetch/fetch"], "1.2.2");
	assert.equal(manifest.dependencies["better-auth"], "1.6.16");
	assert.equal(manifest.dependencies["better-call"], "1.3.6");
	assert.equal(manifest.dependencies["@btst/better-auth-ui"], undefined);
});
