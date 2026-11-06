import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectCandidate, packCandidate } from "../pack-candidate.mjs";
import { candidatePackages, selectRelease } from "./packages.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const script = (name) => fileURLToPath(new URL(name, import.meta.url));

export function selectCohort({ tags, sha, primaryTag, ref, readGit = git }) {
	const packages = candidatePackages(sha, readGit);
	assert.ok(Array.isArray(tags), "Cohort tags must be a JSON array");
	assert.equal(
		tags.length,
		packages.size,
		"Cohort must select every public owner",
	);
	assert.equal(tags[0], primaryTag, "Cohort primary tag must be first");
	assert.equal(
		ref,
		`refs/tags/${primaryTag}`,
		"Cohort workflow ref must match its primary tag",
	);
	assert.equal(
		readGit("status", "--porcelain", "--untracked-files=no"),
		"",
		"Release source must be committed and clean",
	);
	const releases = tags.map((tag) => {
		assert.equal(typeof tag, "string", "Cohort tag must be a string");
		const release = selectRelease(tag, packages);
		assert.equal(
			tag,
			`${release.name}@${release.version}`,
			"Cohort tags must be canonical package tags",
		);
		assert.equal(
			readGit("rev-parse", `refs/tags/${tag}^{commit}`),
			sha,
			"Cohort tag source mismatch",
		);
		return { ...release, sha, tag };
	});
	const order = new Map(
		releases.map((release, index) => [release.name, index]),
	);
	assert.equal(order.size, packages.size, "Cohort must not repeat owners");
	assert.equal(releases[0].name, "@btst/stack", "Core must publish first");
	assert.equal(releases.at(-1).name, "@btst/codegen", "CLI must publish last");
	for (const [index, release] of releases.entries()) {
		assert.equal(
			release.distTag,
			releases[0].distTag,
			"Cohort channels must agree",
		);
		const manifest = JSON.parse(readGit("show", `${sha}:${release.path}`));
		for (const name of Object.keys({
			...manifest.dependencies,
			...manifest.optionalDependencies,
			...manifest.peerDependencies,
		})) {
			if (order.has(name))
				assert.ok(
					order.get(name) < index,
					`Cohort dependency must publish first: ${name} before ${release.name}`,
				);
		}
	}
	return releases;
}

export async function publishCohort({
	releases,
	destination,
	run = execFileSync,
	pack = packCandidate,
	inspect = inspectCandidate,
}) {
	const json = async (path) => JSON.parse(await readFile(path, "utf8"));
	const save = (path, value) =>
		writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
	const prepared = [];
	// Seal the complete build before the first registry mutation.
	for (const release of releases) {
		const directory = join(destination, release.name.slice("@btst/".length));
		await mkdir(directory, { recursive: true });
		const artifact = await pack({
			packageDir: dirname(release.path),
			destination: directory,
			expectedSha: release.sha,
		});
		assert.equal(artifact.name, release.name);
		assert.equal(artifact.version, release.version);
		assert.equal(artifact.gitHead, release.sha);
		await save(join(directory, "release-metadata.json"), release);
		await save(join(directory, "release-artifact.json"), artifact);
		prepared.push({ release, artifact, directory });
	}
	for (const { release, artifact, directory } of prepared) {
		console.log(`Publishing cohort owner ${release.name}@${release.version}`);
		const gateFile = join(directory, "release-gate-publish.json");
		run(
			process.execPath,
			[
				script("gate.mjs"),
				"--sha",
				release.sha,
				"--publishing",
				release.name,
				"--dist-tag",
				release.distTag,
				"--output",
				gateFile,
			],
			{ stdio: "inherit" },
		);
		const gate = await json(gateFile);
		assert.ok(
			gate.passed && gate.mode === "publication" && gate.publication_ready,
			"Cohort publication gate did not pass",
		);
		assert.equal(gate.candidate_sha, release.sha);
		assert.equal(gate.freshness?.observations, 2);
		assert.equal(gate.publication.length, 1);
		assert.equal(gate.publication[0].package, release.name);
		assert.deepEqual(
			await inspect(artifact.path),
			artifact,
			"Sealed cohort archive changed before publication",
		);
		if (gate.publication[0].outcome !== "already-published") {
			run(
				"npm",
				[
					"publish",
					artifact.path,
					"--access",
					"public",
					"--provenance",
					"--tag",
					release.distTag,
				],
				{ stdio: "inherit" },
			);
		}
		run(
			process.execPath,
			[
				script("verify-publication.mjs"),
				join(directory, "release-metadata.json"),
				join(directory, "release-artifact.json"),
				gateFile,
				join(directory, "release-publication.json"),
			],
			{ stdio: "inherit" },
		);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const sha = git("rev-parse", "HEAD");
	const releases = selectCohort({
		tags: JSON.parse(process.env.RELEASE_TAGS ?? "null"),
		sha,
		primaryTag: process.env.RELEASE_TAG,
		ref: process.env.GITHUB_REF,
	});
	if (process.argv[2] === "--validate") console.log(JSON.stringify(releases));
	else {
		assert.equal(process.argv[2], "--publish", "Use --validate or --publish");
		assert.ok(process.env.RUNNER_TEMP, "RUNNER_TEMP is required");
		await publishCohort({
			releases,
			destination: resolve(process.env.RUNNER_TEMP, "release-cohort"),
		});
	}
}
