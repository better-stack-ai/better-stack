import { describe, expect, it } from "vitest";

import {
	AUTH_COHORT,
	assertAuthCohort,
	assertHealthyDependencyTree,
	collectNamedVersions,
	createConsumerManifest,
	findMissingDirectPeers,
	parseArgs,
} from "./runner.mjs";

describe("packed consumer runner", () => {
	it("parses one explicit fixture and package manager", () => {
		expect(
			parseArgs(["--fixture", "core", "--package-manager", "pnpm"]),
		).toEqual({
			fixture: "core",
			packageManager: "pnpm",
			betterAuthUi: undefined,
			keepTemp: false,
		});
	});

	it("accepts the package-runner argument separator", () => {
		expect(
			parseArgs(["--", "--fixture", "core", "--package-manager", "npm"])
				.packageManager,
		).toBe("npm");
	});

	it("requires an injected Better Auth UI artifact for the auth fixture", () => {
		expect(() =>
			parseArgs(["--fixture", "auth", "--package-manager", "npm"]),
		).toThrow(/--better-auth-ui <tarball>/);
	});

	it("rejects missing and invalid dependency-tree entries", () => {
		expect(() =>
			assertHealthyDependencyTree({
				name: "consumer",
				problems: ["missing: better-call@1.3.6"],
				dependencies: {
					"better-call": { version: "2.0.2", invalid: true },
				},
			}),
		).toThrow(/missing: better-call@1\.3\.6.*better-call@2\.0\.2 is invalid/s);
	});

	it("finds non-optional peers that are not direct consumer dependencies", () => {
		expect(
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
		).toEqual(["better-call@1.3.6"]);
	});

	it("requires the retained cohort while allowing valid duplicate implementations", () => {
		const versions = Object.fromEntries(
			Object.entries(AUTH_COHORT).map(([name, version]) => [name, [version]]),
		);

		expect(() => assertAuthCohort(versions)).not.toThrow();
		expect(() =>
			assertAuthCohort({
				...versions,
				"better-call": ["1.3.6", "2.0.2"],
			}),
		).not.toThrow();
		expect(() =>
			assertAuthCohort({ ...versions, "better-call": ["2.0.2"] }),
		).toThrow(/better-call: expected 1\.3\.6 to be present; found 2\.0\.2/);
	});

	it("combines direct and nested package-manager dependency views", () => {
		const versions = collectNamedVersions(
			[
				[{ dependencies: { "better-auth": { version: "1.6.16" } } }],
				[{ dependencies: { "@btst/db": { version: "2.2.3" } } }],
			],
			["better-auth", "@btst/db"],
		);

		expect(versions).toEqual({
			"better-auth": ["1.6.16"],
			"@btst/db": ["2.2.3"],
		});
	});

	it("directly satisfies the published DB and Core peer contracts", () => {
		const manifest = createConsumerManifest({
			fixture: "core",
			stackTarball: "/tmp/stack.tgz",
		});

		expect(manifest.dependencies["@better-auth/core"]).toBe("1.6.16");
		expect(manifest.dependencies["@better-auth/utils"]).toBe("0.4.1");
		expect(manifest.dependencies["@better-fetch/fetch"]).toBe("1.2.2");
		expect(manifest.dependencies["@btst/db"]).toBe("2.2.3");
		expect(manifest.dependencies["better-auth"]).toBe("1.6.16");
		expect(manifest.dependencies["better-call"]).toBe("1.3.6");
		expect(manifest.dependencies["@btst/better-auth-ui"]).toBeUndefined();
	});
});
