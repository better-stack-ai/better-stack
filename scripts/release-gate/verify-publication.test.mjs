import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicationAncestry, requireFreshEvidence } from "./gate.mjs";
import { verifyPublication } from "./verify-publication.mjs";

test("first beta verifies absent or implicit latest and later betas preserve the prior tag", async () => {
	const release = {
		name: "@btst/plugin-blog",
		version: "1.0.0-beta.0",
		distTag: "next",
		sha: "a".repeat(40),
	};
	const artifact = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		integrity: "sha512-beta0",
	};
	const published = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		dist: { integrity: artifact.integrity },
	};
	const source = { initialPrerelease: true };
	const verify = (latest, receipt = source) =>
		verifyPublication({
			release,
			artifact,
			source: receipt,
			registry: async (_name, version) =>
				version === "latest" ? latest : published,
		});
	await verify(null);
	await verify(published);
	for (const latest of [
		{ ...published, version: "1.0.0" },
		{ ...published, gitHead: "c".repeat(40) },
		{ ...published, dist: { integrity: "sha512-foreign" } },
	])
		await assert.rejects(verify(latest), /Initial prerelease/);
	const prior = {
		...published,
		version: "1.0.0-beta.previous",
		gitHead: "b".repeat(40),
		dist: { integrity: "sha512-previous" },
	};
	const receipt = {
		initialPrerelease: true,
		prereleaseLatest: {
			version: prior.version,
			sha: prior.gitHead,
			integrity: prior.dist.integrity,
		},
	};
	await verify(prior, receipt);
	await assert.rejects(verify(published, receipt), /Initial prerelease/);
	await assert.rejects(verify(null, receipt), /Initial prerelease/);
});

test("first stable publication verifies the selected archive after two consistent ancestry observations", async () => {
	const directory = await mkdtemp(join(tmpdir(), "btst-first-stable-"));
	const readGit = (...args) =>
		execFileSync("git", args, {
			cwd: directory,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	try {
		readGit("init", "-q");
		readGit("config", "user.name", "Publication regression");
		readGit("config", "user.email", "test@example.invalid");
		await mkdir(join(directory, "packages/plugin-blog"), { recursive: true });
		const name = "@btst/plugin-blog";
		const commit = async (version) => {
			await writeFile(
				join(directory, "packages/plugin-blog/package.json"),
				JSON.stringify({ name, version }),
			);
			readGit("add", ".");
			readGit("commit", "-qm", version);
			return readGit("rev-parse", "HEAD");
		};
		const beta = {
			name,
			version: "1.0.0-beta.0",
			gitHead: await commit("1.0.0-beta.0"),
			dist: { integrity: "sha512-beta" },
		};
		const release = {
			name,
			version: "1.0.0",
			distTag: "latest",
			sha: await commit("1.0.0"),
		};
		const registry = async (_name, version) =>
			version === undefined
				? { name, versions: { [beta.version]: beta } }
				: version === "latest"
					? beta
					: null;
		let source;
		const freshness = await requireFreshEvidence(async () => ({
			publication: [
				(source = await publicationAncestry({
					packageName: name,
					distTag: release.distTag,
					sha: release.sha,
					readGit,
					registry,
				})),
			],
		}));
		assert.equal(freshness.observations, 2);
		assert.equal(source.outcome, "first-stable-from-prereleases");
		const artifact = {
			name,
			version: release.version,
			gitHead: release.sha,
			integrity: "sha512-stable-archive",
		};
		const published = {
			name,
			version: release.version,
			gitHead: release.sha,
			dist: { integrity: artifact.integrity },
		};
		const verify = (latest) =>
			verifyPublication({
				release,
				artifact,
				source,
				registry: async (_name, version) =>
					version === "latest" ? latest : published,
			});
		assert.equal((await verify(published)).integrity, artifact.integrity);
		await assert.rejects(verify(beta), /Published version\/tag mismatch/);
		await assert.rejects(
			verify({ ...published, dist: { integrity: "sha512-foreign" } }),
			/Published artifact integrity mismatch/,
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("a reconciled published retry verifies the original integrity when the same source repacks differently", async () => {
	const directory = await mkdtemp(join(tmpdir(), "btst-publication-retry-"));
	const readGit = (...args) =>
		execFileSync("git", args, {
			cwd: directory,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	try {
		readGit("init", "-q");
		readGit("config", "user.name", "Publication regression");
		readGit("config", "user.email", "test@example.invalid");
		await mkdir(join(directory, "packages/plugin-ai-chat"), {
			recursive: true,
		});
		await writeFile(
			join(directory, "packages/plugin-ai-chat/package.json"),
			JSON.stringify({ name: "@btst/plugin-ai-chat", version: "1.0.0" }),
		);
		readGit("add", ".");
		readGit("commit", "-qm", "candidate");
		const release = {
			name: "@btst/plugin-ai-chat",
			version: "1.0.0",
			distTag: "latest",
			sha: readGit("rev-parse", "HEAD"),
		};
		// Recorded same-source AI Chat archives have equal sizes and different SRIs.
		const published = {
			name: release.name,
			version: release.version,
			gitHead: release.sha,
			dist: {
				integrity:
					"sha512-D6nkl7nznMbIezA7T6aLvFH5fs26JA8+xga5b4oFg77xXwAz3oPfiya2HpVKOFdqr0v0NHRmYslLv7gNKLDFfg==",
			},
		};
		const artifact = {
			name: release.name,
			version: release.version,
			gitHead: release.sha,
			integrity:
				"sha512-U1iOvzG1S47Gpes+5+uoDvJdjOWssKCyU9Z6kTk0ub+3NntyGBiXw9CgJHr3VS5y74B3+v8MT5EafQ6pMGpi6Q==",
		};
		const registry = async (name, version) => {
			assert.equal(name, release.name);
			assert.ok([release.version, release.distTag].includes(version));
			return published;
		};
		let source;
		const freshness = await requireFreshEvidence(async () => ({
			publication: [
				(source = await publicationAncestry({
					packageName: release.name,
					distTag: release.distTag,
					sha: release.sha,
					readGit,
					registry,
				})),
			],
		}));
		assert.equal(freshness.observations, 2);
		assert.equal(source.outcome, "already-published");
		const gate = {
			passed: true,
			mode: "publication",
			publication_ready: true,
			candidate_sha: release.sha,
			freshness,
			publication: [source],
		};
		const receipt = await verifyPublication({
			release,
			artifact,
			source,
			registry,
		});
		assert.equal(receipt.integrity, published.dist.integrity);
		for (const changed of [
			{ ...source, package: "@btst/plugin-blog" },
			{ ...source, version: "2.0.0" },
			{ ...source, dist_tag: "next" },
			{ ...source, source: { ...source.source, sha: "b".repeat(40) } },
			{
				...source,
				tagged: { ...source.tagged, integrity: artifact.integrity },
			},
			{ ...source, source: { ...source.source, integrity: undefined } },
		]) {
			await assert.rejects(
				verifyPublication({ release, artifact, source: changed, registry }),
				/Reconciled/,
			);
		}
		for (const changed of [
			{ ...published, gitHead: "b".repeat(40) },
			{ ...published, dist: { integrity: artifact.integrity } },
			{ ...published, version: "2.0.0" },
		]) {
			await assert.rejects(
				verifyPublication({
					release,
					artifact,
					source,
					registry: async (_name, version) =>
						version === release.distTag ? changed : published,
				}),
				/Published/,
			);
		}
		const paths = [
			"release.json",
			"artifact.json",
			"gate.json",
			"publication.json",
		].map((name) => join(directory, name));
		await writeFile(paths[0], JSON.stringify(release));
		await writeFile(paths[1], JSON.stringify(artifact));
		const noNetwork = `data:text/javascript,${encodeURIComponent('globalThis.fetch = () => { throw new Error("Registry must not be accessed"); };')}`;
		for (const [invalidGate, message] of [
			[
				{ ...gate, candidate_sha: "b".repeat(40) },
				"Publication preflight source mismatch",
			],
			[
				{ ...gate, freshness: { ...freshness, observations: 1 } },
				"Publication preflight requires both observations",
			],
		]) {
			await writeFile(paths[2], JSON.stringify(invalidGate));
			assert.throws(
				() =>
					execFileSync(
						process.execPath,
						[
							"--import",
							noNetwork,
							fileURLToPath(new URL("verify-publication.mjs", import.meta.url)),
							...paths,
						],
						{ timeout: 5000, stdio: ["ignore", "pipe", "pipe"] },
					),
				(error) => error.stderr?.toString().includes(message),
			);
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test("publication verification requires the selected artifact and preserves its stable channel", async () => {
	const release = {
		name: "@btst/plugin-blog",
		version: "1.1.0-next.0",
		distTag: "next",
		sha: "a".repeat(40),
	};
	const artifact = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		integrity: "sha512-candidate",
	};
	const published = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		dist: { integrity: artifact.integrity },
	};
	const stable = {
		version: "1.0.0",
		sha: "b".repeat(40),
		integrity: "sha512-stable",
	};
	const calls = [];
	const registry = async (name, version) => {
		calls.push(name);
		return version === "latest"
			? {
					name,
					version: stable.version,
					gitHead: stable.sha,
					dist: { integrity: stable.integrity },
				}
			: published;
	};
	await verifyPublication({ release, artifact, source: { stable }, registry });
	assert.deepEqual([...new Set(calls)], [release.name]);
	for (const changed of [
		{ ...published, gitHead: "c".repeat(40) },
		{ ...published, dist: { integrity: "sha512-wrong" } },
		{ ...published, version: "2.0.0" },
	]) {
		await assert.rejects(
			verifyPublication({
				release,
				artifact,
				source: { stable },
				registry: async () => changed,
			}),
		);
	}
	await assert.rejects(
		verifyPublication({
			release,
			artifact,
			source: { stable },
			registry: async (name, version) =>
				version === "latest" ? published : registry(name, version),
		}),
		/Stable/,
	);
	const reconciled = {
		package: release.name,
		version: release.version,
		dist_tag: release.distTag,
		outcome: "already-published",
		source: {
			version: release.version,
			sha: release.sha,
			integrity: artifact.integrity,
		},
		tagged: {
			version: release.version,
			sha: release.sha,
			integrity: artifact.integrity,
		},
		stable,
	};
	const repack = { ...artifact, integrity: "sha512-different-repack" };
	await verifyPublication({
		release,
		artifact: repack,
		source: reconciled,
		registry,
	});
	await assert.rejects(
		verifyPublication({
			release,
			artifact: repack,
			source: reconciled,
			registry: async (name, version) =>
				version === "latest" ? published : registry(name, version),
		}),
		/Stable/,
	);
});
