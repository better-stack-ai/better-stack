import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { selectCohort } from "./cohort.mjs";
import { candidatePackages, selectRelease } from "./packages.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const planPath = ".github/release-cohort.json";

export function createCohortPlan(sha, baseSha, readGit = git) {
	assert.match(
		baseSha ?? "",
		/^[a-f0-9]{40}$/,
		"Plan requires a full base commit SHA",
	);
	readGit("merge-base", "--is-ancestor", baseSha, sha);
	const packages = candidatePackages(sha, readGit);
	const previous = candidatePackages(baseSha, readGit);
	const selected = new Map(
		[...packages].filter(
			([name, entry]) => previous.get(name)?.version !== entry.version,
		),
	);
	assert.ok(
		selected.size > 0,
		"No public package versions changed since the base",
	);
	const dependencies = new Map();
	for (const [name, entry] of selected) {
		const manifest = JSON.parse(readGit("show", `${sha}:${entry.path}`));
		dependencies.set(
			name,
			Object.keys({
				...manifest.dependencies,
				...manifest.optionalDependencies,
				...manifest.peerDependencies,
			}).filter((dependency) => selected.has(dependency)),
		);
	}
	const ordered = [];
	if (selected.has("@btst/stack")) ordered.push("@btst/stack");
	const pending = [...selected.keys()]
		.filter((name) => !["@btst/stack", "@btst/codegen"].includes(name))
		.sort();
	while (pending.length) {
		const index = pending.findIndex((name) =>
			dependencies
				.get(name)
				.every((dependency) => ordered.includes(dependency)),
		);
		assert.ok(
			index >= 0,
			"No dependency order exists with selected Core first and CLI last",
		);
		ordered.push(...pending.splice(index, 1));
	}
	if (selected.has("@btst/codegen")) ordered.push("@btst/codegen");
	for (const [index, name] of ordered.entries())
		assert.ok(
			dependencies
				.get(name)
				.every((dependency) => ordered.indexOf(dependency) < index),
			"Selected dependencies must publish first",
		);
	const tags = ordered.map((name) => `${name}@${selected.get(name).version}`);
	assert.equal(
		new Set(tags.map((tag) => selectRelease(tag, packages).distTag)).size,
		1,
		"Cohort channels must agree",
	);
	return { version: 1, baseSha, primaryTag: tags[0], tags };
}

export function selectReleaseCohort({
	sha,
	tag,
	ref,
	event,
	explicitTags,
	prerelease,
	readGit = git,
}) {
	assert.ok(["release", "workflow_dispatch"].includes(event));
	const primary = selectRelease(
		tag,
		candidatePackages(sha, readGit),
		prerelease,
	);
	let tags;
	if (explicitTags) {
		assert.equal(
			event,
			"workflow_dispatch",
			"Explicit tags require manual dispatch",
		);
		tags = JSON.parse(explicitTags);
	} else if (readGit("ls-tree", "--name-only", sha, "--", planPath)) {
		const plan = JSON.parse(readGit("show", `${sha}:${planPath}`));
		if (plan.primaryTag !== tag && primary.name !== "@btst/stack") return null;
		assert.equal(plan.version, 1, "Unsupported release cohort plan");
		assert.equal(
			plan.primaryTag,
			tag,
			"Release tag does not match the committed cohort plan",
		);
		assert.deepEqual(
			plan,
			createCohortPlan(sha, plan.baseSha, readGit),
			"Committed plan must match all version changes since its base",
		);
		tags = plan.tags;
	} else {
		return null;
	}
	return selectCohort({ tags, sha, primaryTag: tag, ref, readGit });
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const sha = git("rev-parse", "HEAD");
	if (process.argv[2] === "--plan") {
		assert.equal(
			process.argv.length,
			4,
			"Use --plan <previous-release-commit-or-ref>",
		);
		const baseSha = git(
			"rev-parse",
			"--verify",
			"--end-of-options",
			`${process.argv[3]}^{commit}`,
		);
		console.log(JSON.stringify(createCohortPlan(sha, baseSha), null, 2));
	} else {
		assert.equal(
			process.argv[2],
			undefined,
			"Use --plan or the release workflow environment",
		);
		const releases = selectReleaseCohort({
			sha,
			tag: process.env.RELEASE_TAG ?? "",
			ref: process.env.GITHUB_REF,
			event: process.env.GITHUB_EVENT_NAME,
			explicitTags: process.env.RELEASE_TAGS,
			prerelease: process.env.GITHUB_PRERELEASE
				? process.env.GITHUB_PRERELEASE === "true"
				: undefined,
		});
		const tags = releases?.map((release) => release.tag);
		if (process.env.GITHUB_OUTPUT) {
			appendFileSync(
				process.env.GITHUB_OUTPUT,
				`tags=${tags ? JSON.stringify(tags) : ""}\n`,
			);
		}
		console.log(JSON.stringify(tags ?? null));
	}
}
