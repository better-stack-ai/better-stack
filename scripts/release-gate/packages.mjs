import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

export function candidatePackages(sha, readGit = git) {
	const paths = readGit("ls-tree", "-r", "--name-only", sha, "--", "packages")
		.split("\n")
		.filter((path) => /^packages\/[^/]+\/package\.json$/.test(path));
	const packages = new Map();
	for (const path of paths) {
		const manifest = JSON.parse(readGit("show", `${sha}:${path}`));
		if (
			manifest.private ||
			!/^@btst\/(?:stack|codegen|components|plugin-[a-z0-9-]+)$/.test(
				manifest.name,
			)
		)
			continue;
		assert.ok(
			typeof manifest.version === "string" && manifest.version,
			"Candidate package version is missing",
		);
		assert.ok(
			!packages.has(manifest.name),
			`Duplicate candidate package: ${manifest.name}`,
		);
		packages.set(manifest.name, {
			name: manifest.name,
			version: manifest.version,
			path,
		});
	}
	return packages;
}

export function selectRelease(tag, packages, prerelease) {
	const name = tag.startsWith("v")
		? "@btst/stack"
		: tag.slice(0, tag.lastIndexOf("@"));
	const version = tag.startsWith("v")
		? tag.slice(1)
		: tag.slice(tag.lastIndexOf("@") + 1);
	const candidate = packages.get(name);
	assert.ok(candidate, `Unknown release package tag: ${tag}`);
	assert.equal(
		candidate.version,
		version,
		"Release tag version does not match candidate package version",
	);
	const isPrerelease = version.split("+")[0].includes("-");
	if (prerelease !== undefined)
		assert.equal(
			prerelease,
			isPrerelease,
			"Release prerelease metadata does not match selected package version",
		);
	return { ...candidate, distTag: isPrerelease ? "next" : "latest" };
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const sha = git("rev-parse", "HEAD");
	const prerelease =
		process.env.GITHUB_PRERELEASE === undefined ||
		process.env.GITHUB_PRERELEASE === ""
			? undefined
			: process.env.GITHUB_PRERELEASE === "true";
	const release = selectRelease(
		process.env.RELEASE_TAG ?? "",
		candidatePackages(sha),
		prerelease,
	);
	assert.equal(
		git("rev-parse", `refs/tags/${process.env.RELEASE_TAG}^{commit}`),
		sha,
		"Release tag does not identify the checked-out candidate",
	);
	assert.equal(
		git("status", "--porcelain", "--untracked-files=no"),
		"",
		"Release source must be committed and clean",
	);
	if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch")
		assert.equal(
			process.env.GITHUB_REF,
			`refs/tags/${process.env.RELEASE_TAG}`,
			"Manual retry ref must match release tag",
		);
	console.log(JSON.stringify({ ...release, sha }));
}
