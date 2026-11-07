import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { verifyNpmStagingPlaceholder } from "./npm-staging.mjs";
import { verifyPublication } from "./verify-publication.mjs";
import {
	publicationAncestry,
	publicationReadiness,
	requireFreshEvidence,
} from "./gate.mjs";

const packageName = "@btst/plugin-blog";
const candidateSha = "a".repeat(40);
const previousSha = "b".repeat(40);
const description = "Temporary package placeholder for staged publishing";
const readme =
	"# Temporary Holding Version\n\nThis version is a temporary placeholder for this package. An operational version to replace this has been submitted for review and is awaiting a staged release.\n";

function placeholderFixture({ manifest = {}, files = {} } = {}) {
	const directory = mkdtempSync(join(tmpdir(), "npm-stage-gate-"));
	try {
		mkdirSync(join(directory, "package"));
		const contents = {
			"package.json": JSON.stringify({
				name: packageName,
				version: "0.0.0-stage",
				stub: true,
				description,
				...manifest,
			}),
			"README.md": readme,
			...files,
		};
		for (const [name, content] of Object.entries(contents))
			writeFileSync(join(directory, "package", name), content);
		const archive = execFileSync("tar", ["-czf", "-", "package"], {
			cwd: directory,
		});
		return {
			archive,
			published: {
				name: packageName,
				version: "0.0.0-stage",
				stub: true,
				description,
				dist: {
					tarball: `https://registry.npmjs.org/${packageName}/-/plugin-blog-0.0.0-stage.tgz`,
					integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
					fileCount: Object.keys(contents).length,
					unpackedSize: Object.values(contents).reduce(
						(sum, content) => sum + Buffer.byteLength(content),
						0,
					),
				},
			},
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function options(
	fixture,
	{ candidateVersion = "1.0.0", latest = "beta", history = "beta" } = {},
) {
	const previous = {
		name: packageName,
		version: "1.0.0-beta.0",
		gitHead: previousSha,
		dist: { integrity: "sha512-beta" },
	};
	return {
		packageName,
		distTag: candidateVersion.includes("-") ? "next" : "latest",
		sha: candidateSha,
		readGit: (command, ref) =>
			command === "ls-tree"
				? "packages/plugin-blog/package.json"
				: command === "show"
					? JSON.stringify({
							name: packageName,
							version: ref.startsWith(previousSha)
								? previous.version
								: candidateVersion,
						})
					: "",
		registry: async (_name, version) =>
			version === undefined
				? {
						name: packageName,
						versions: {
							"0.0.0-stage": fixture.published,
							...(history === "beta" ? { [previous.version]: previous } : {}),
						},
					}
				: version === "latest"
					? latest === "beta"
						? previous
						: latest === "stub"
							? fixture.published
							: null
					: null,
		fetchArchive: async () => new Response(fixture.archive),
	};
}

test("first stable verifies the inert npm staging archive without treating it as source history", async () => {
	const fixture = placeholderFixture();
	const receipt = await publicationReadiness(options(fixture));
	assert.equal(receipt.outcome, "first-stable-from-prereleases");
	assert.equal(receipt.previousPrereleases.length, 1);
	assert.equal(receipt.previousPrereleases[0].sha, previousSha);
	assert.deepEqual(receipt.stagingPlaceholders, [
		{
			name: packageName,
			version: "0.0.0-stage",
			integrity: fixture.published.dist.integrity,
			kind: "npm-staging-placeholder",
			archiveVerified: true,
		},
	]);
	assert.equal(
		(await requireFreshEvidence(() => publicationAncestry(options(fixture))))
			.observations,
		2,
	);
});

test("the first staged beta accepts npm implicit latest while protecting later releases", async () => {
	const fixture = placeholderFixture();
	const source = await publicationAncestry(
		options(fixture, {
			candidateVersion: "1.0.0-beta.0",
			latest: "stub",
			history: "stub",
		}),
	);
	assert.equal(source.outcome, "initial-prerelease");
	assert.equal(source.firstStagedBeta, true);
	assert.deepEqual(source.prereleaseLatest, {
		version: fixture.published.version,
		integrity: fixture.published.dist.integrity,
	});
	const release = {
		name: packageName,
		version: "1.0.0-beta.0",
		sha: candidateSha,
		distTag: "next",
	};
	const published = {
		name: packageName,
		version: release.version,
		gitHead: candidateSha,
		dist: { integrity: "sha512-real-beta" },
	};
	const verify = (latest, receipt = source) =>
		verifyPublication({
			release,
			artifact: {
				name: packageName,
				version: release.version,
				gitHead: candidateSha,
				integrity: published.dist.integrity,
			},
			source: receipt,
			registry: async (_name, version) =>
				version === "latest" ? latest : published,
		});
	assert.equal((await verify(fixture.published)).gitHead, candidateSha);
	await verify(fixture.published, JSON.parse(JSON.stringify(source)));
	await verify(published);
	await verify(published, JSON.parse(JSON.stringify(source)));
	await assert.rejects(
		verify(published, { ...source, firstStagedBeta: undefined }),
		/Initial prerelease/,
	);
	await assert.rejects(
		verify(published, { ...source, stagingPlaceholders: [] }),
		/verified placeholder receipt/,
	);
	for (const latest of [
		null,
		{ ...published, gitHead: previousSha },
		{ ...published, dist: { integrity: "sha512-foreign" } },
		{ ...published, version: "1.0.0" },
		{ ...fixture.published, gitHead: candidateSha },
		{ ...fixture.published, dist: { integrity: "sha512-changed" } },
	])
		await assert.rejects(verify(latest), /Initial prerelease/);
	const later = await publicationAncestry(
		options(fixture, { candidateVersion: "1.0.0-beta.1", latest: "stub" }),
	);
	const laterRelease = { ...release, version: "1.0.0-beta.1" };
	const laterPublished = { ...published, version: laterRelease.version };
	await assert.rejects(
		verifyPublication({
			release: laterRelease,
			artifact: {
				name: packageName,
				version: laterRelease.version,
				gitHead: candidateSha,
				integrity: published.dist.integrity,
			},
			source: later,
			registry: async () => laterPublished,
		}),
		/Initial prerelease/,
	);
	await assert.rejects(
		publicationAncestry(options(fixture, { latest: "stub", history: "stub" })),
		/verified prerelease-only history/,
	);
});

test("staging provisioning does not exempt real betas from source checks, ancestry or channel preservation", async () => {
	const fixture = placeholderFixture();
	for (const latest of ["beta", "stub", null]) {
		const configuration = options(fixture, {
			candidateVersion: "1.0.0-beta.1",
			latest,
		});
		const result = await publicationAncestry(configuration);
		assert.equal(result.initialPrerelease, true);
		assert.equal(result.firstStagedBeta, undefined);
		assert.equal(
			result.prereleaseLatest?.sha,
			latest === "beta" ? previousSha : undefined,
		);
		await assert.rejects(
			publicationAncestry({
				...configuration,
				readGit: (command, ...args) => {
					if (command === "merge-base") throw new Error("Foreign beta source");
					return configuration.readGit(command, ...args);
				},
			}),
			/does not include published/,
		);
	}
	const configuration = options(fixture);
	for (const change of [
		{ gitHead: undefined },
		{ stub: true, gitHead: undefined },
	]) {
		await assert.rejects(
			publicationAncestry({
				...configuration,
				registry: async (...args) => {
					const value = await configuration.registry(...args);
					if (args[1] === undefined)
						value.versions["1.0.0-beta.0"] = {
							...value.versions["1.0.0-beta.0"],
							...change,
						};
					return value;
				},
			}),
			/source identity is unavailable/,
		);
	}
	const placeholderLatest = options(fixture, { latest: "stub" });
	await assert.rejects(
		publicationAncestry({
			...placeholderLatest,
			registry: async (...args) => {
				const value = await placeholderLatest.registry(...args);
				return args[1] === "latest"
					? { ...value, dist: { ...value.dist, integrity: "sha512-wrong" } }
					: value;
			},
		}),
		/placeholder latest does not match/,
	);
});

test("published beta retries retain exact source and integrity beside a verified staging placeholder", async () => {
	const fixture = placeholderFixture();
	const configuration = options(fixture, { candidateVersion: "1.0.0-beta.0" });
	const published = {
		name: packageName,
		version: "1.0.0-beta.0",
		gitHead: candidateSha,
		dist: { integrity: "sha512-real-beta" },
	};
	const registry = async (_name, version) =>
		version === undefined
			? {
					name: packageName,
					versions: {
						"0.0.0-stage": fixture.published,
						[published.version]: published,
					},
				}
			: published;
	const receipt = await publicationAncestry({ ...configuration, registry });
	assert.equal(receipt.outcome, "already-published");
	assert.equal(receipt.source.sha, candidateSha);
	assert.equal(receipt.tagged.integrity, published.dist.integrity);
	await assert.rejects(
		publicationAncestry({
			...configuration,
			registry: async (...args) => {
				const result = await registry(...args);
				return args[1] === "next"
					? { ...result, dist: { integrity: "sha512-other" } }
					: result;
			},
		}),
		/not selected by requested next tag/,
	);
});

test("only the canonical inert staging archive is exempted from source history", async () => {
	for (const fixture of [
		placeholderFixture({
			manifest: { scripts: { install: "node payload.js" } },
		}),
		placeholderFixture({ manifest: { bin: "README.md" } }),
		placeholderFixture({ manifest: { main: "README.md" } }),
		placeholderFixture({ manifest: { dependencies: { unexpected: "1.0.0" } } }),
		placeholderFixture({
			files: { "README.md": "Different placeholder text" },
		}),
		placeholderFixture({ files: { "index.js": "process.exit(0)" } }),
	]) {
		fixture.published.dist.fileCount = 2;
		await assert.rejects(publicationAncestry(options(fixture)));
	}
	const fixture = placeholderFixture();
	for (const published of [
		{ ...fixture.published, stub: false },
		{ ...fixture.published, name: "@btst/plugin-cms" },
		{ ...fixture.published, gitHead: candidateSha },
		{ ...fixture.published, scripts: { install: "node index.js" } },
		{
			...fixture.published,
			dist: {
				...fixture.published.dist,
				tarball: "https://example.com/placeholder.tgz",
			},
		},
		{
			...fixture.published,
			dist: { ...fixture.published.dist, integrity: "sha512-other" },
		},
		{
			...fixture.published,
			dist: { ...fixture.published.dist, unpackedSize: 4097 },
		},
	])
		await assert.rejects(
			verifyNpmStagingPlaceholder(
				published,
				packageName,
				async () => new Response(fixture.archive),
			),
		);
});

test("staging inspection rejects unavailable, oversized and overexpanded archives", async () => {
	const fixture = placeholderFixture();
	await assert.rejects(
		verifyNpmStagingPlaceholder(
			fixture.published,
			packageName,
			async () => new Response(null, { status: 503 }),
		),
		/HTTP 503/,
	);
	for (const archive of [
		Buffer.alloc(16385),
		gzipSync(Buffer.alloc(16385)),
		Buffer.from("not gzip"),
	]) {
		const published = {
			...fixture.published,
			dist: {
				...fixture.published.dist,
				integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
			},
		};
		await assert.rejects(
			verifyNpmStagingPlaceholder(
				published,
				packageName,
				async () => new Response(archive),
			),
		);
	}
});

test("staging inspection rejects a file disguised as the package directory", async () => {
	const fixture = placeholderFixture();
	const archive = gunzipSync(fixture.archive);
	assert.equal(archive[156], "5".charCodeAt(0));
	archive[156] = "0".charCodeAt(0);
	archive.write("package\0", 0, "ascii");
	archive.fill(32, 148, 156);
	const checksum = archive
		.subarray(0, 512)
		.reduce((sum, byte) => sum + byte, 0);
	archive.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");
	fixture.archive = gzipSync(archive);
	fixture.published.dist.integrity = `sha512-${createHash("sha512").update(fixture.archive).digest("base64")}`;
	await assert.rejects(
		verifyNpmStagingPlaceholder(
			fixture.published,
			packageName,
			async () => new Response(fixture.archive),
		),
		/member type/,
	);
});
