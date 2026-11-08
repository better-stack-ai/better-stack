import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createCohortPlan, selectReleaseCohort } from "./selection.mjs";

const sha = "a".repeat(40);
const baseSha = "c".repeat(40);
const planPath = ".github/release-cohort.json";
function fixture({
	beta = false,
	plan,
	mutate = () => {},
	wrongTag = false,
	unchanged = [],
	ancestryFailure = false,
} = {}) {
	const suffix = beta ? "-beta.1" : "";
	const manifests = {
		"packages/stack/package.json": {
			name: "@btst/stack",
			version: `6.3.0${suffix}`,
		},
		"packages/blog/package.json": {
			name: "@btst/plugin-blog",
			version: `1.2.0${suffix}`,
			peerDependencies: { "@btst/stack": "*" },
		},
		"packages/comments/package.json": {
			name: "@btst/plugin-comments",
			version: `1.2.0${suffix}`,
			dependencies: { "@btst/plugin-blog": "*" },
		},
		"packages/cli/package.json": {
			name: "@btst/codegen",
			version: `6.3.0${suffix}`,
			dependencies: { "@btst/plugin-comments": "*" },
		},
		"packages/ui/package.json": {
			name: "@workspace/ui",
			private: true,
			version: "1.0.0",
		},
	};
	mutate(manifests);
	const readGit = (command, ...args) => {
		if (command === "ls-tree")
			return args.at(-1) === planPath
				? plan === undefined
					? ""
					: planPath
				: Object.keys(manifests).join("\n");
		if (command === "merge-base") {
			if (ancestryFailure) throw new Error("base is not an ancestor");
			return "";
		}
		if (command === "status") return "";
		if (command === "rev-parse") return wrongTag ? "b".repeat(40) : sha;
		assert.equal(command, "show");
		const path = args[0].slice(sha.length + 1);
		return path === planPath
			? typeof plan === "string"
				? plan
				: JSON.stringify(plan)
			: JSON.stringify(
					args[0].startsWith(baseSha) &&
						!unchanged.includes(manifests[path].name)
						? { ...manifests[path], version: "0.0.0" }
						: manifests[path],
				);
	};
	return readGit;
}
const stablePlan = createCohortPlan(sha, baseSha, fixture());
function select(options = {}) {
	return selectReleaseCohort({
		sha,
		tag: stablePlan.primaryTag,
		ref: `refs/tags/${stablePlan.primaryTag}`,
		event: "release",
		prerelease: false,
		readGit: fixture({ plan: stablePlan }),
		...options,
	});
}

test("beta and stable GitHub Releases select their complete committed dependency order", () => {
	for (const beta of [false, true]) {
		const plan = createCohortPlan(sha, baseSha, fixture({ beta }));
		assert.deepEqual(
			plan.tags.map((tag) => tag.slice(0, tag.lastIndexOf("@"))),
			[
				"@btst/stack",
				"@btst/plugin-blog",
				"@btst/plugin-comments",
				"@btst/codegen",
			],
		);
		const releases = select({
			tag: plan.primaryTag,
			ref: `refs/tags/${plan.primaryTag}`,
			prerelease: beta,
			readGit: fixture({ beta, plan }),
		});
		assert.deepEqual(
			releases.map((release) => release.tag),
			plan.tags,
		);
		assert.ok(
			releases.every(
				(release) => release.distTag === (beta ? "next" : "latest"),
			),
		);
	}
});

test("independent releases keep their behavior without consuming a stale Core plan", () => {
	assert.equal(select({ readGit: fixture() }), null);
	assert.equal(select({ tag: "v6.3.0", readGit: fixture() }), null);
	assert.equal(
		select({
			tag: "@btst/plugin-blog@1.2.0",
			readGit: fixture({ plan: stablePlan }),
		}),
		null,
	);
});

test("beta and stable plans select bumped plugins while excluding unchanged Core and CLI", () => {
	for (const beta of [false, true]) {
		const options = { beta, unchanged: ["@btst/stack", "@btst/codegen"] };
		const plan = createCohortPlan(sha, baseSha, fixture(options));
		assert.deepEqual(plan.tags, [
			`@btst/plugin-blog@1.2.0${beta ? "-beta.1" : ""}`,
			`@btst/plugin-comments@1.2.0${beta ? "-beta.1" : ""}`,
		]);
		assert.equal(
			select({
				tag: plan.primaryTag,
				ref: `refs/tags/${plan.primaryTag}`,
				prerelease: beta,
				readGit: fixture({ ...options, plan }),
			}).length,
			2,
		);
	}
	assert.throws(
		() => createCohortPlan(sha, baseSha, fixture({ ancestryFailure: true })),
		/ancestor/,
	);
	assert.throws(
		() =>
			createCohortPlan(
				sha,
				baseSha,
				fixture({
					unchanged: [
						"@btst/stack",
						"@btst/codegen",
						"@btst/plugin-blog",
						"@btst/plugin-comments",
					],
				}),
			),
		/No public package versions changed/,
	);
});

test("manual retries reuse a plan and historical explicit cohorts remain supported", () => {
	assert.deepEqual(
		select({ event: "workflow_dispatch", prerelease: undefined }),
		select(),
	);
	assert.deepEqual(
		select({
			event: "workflow_dispatch",
			explicitTags: JSON.stringify(stablePlan.tags),
			readGit: fixture(),
		}),
		select(),
	);
	assert.throws(
		() => select({ explicitTags: JSON.stringify(stablePlan.tags) }),
		/manual dispatch/,
	);
});

test("invalid plans fail closed before publication", () => {
	for (const plan of [
		"invalid JSON",
		{ ...stablePlan, version: 2 },
		{ ...stablePlan, primaryTag: "@btst/stack@6.2.0" },
		{ ...stablePlan, tags: stablePlan.tags.slice(0, -1) },
		{
			...stablePlan,
			tags: [
				stablePlan.tags[0],
				stablePlan.tags[2],
				stablePlan.tags[1],
				stablePlan.tags[3],
			],
		},
		{
			...stablePlan,
			tags: stablePlan.tags.map((tag) => tag.replace("1.2.0", "1.1.0")),
		},
	]) {
		assert.throws(() => select({ readGit: fixture({ plan }) }));
	}
	assert.throws(
		() => select({ readGit: fixture({ plan: stablePlan, wrongTag: true }) }),
		/source mismatch/,
	);
	assert.throws(() => select({ ref: "refs/heads/main" }), /workflow ref/);
	assert.throws(() => select({ prerelease: true }), /prerelease metadata/);
	assert.throws(() => select({ tag: "v6.3.0" }), /committed cohort plan/);
});

test("plan generation rejects mixed channels and dependency cycles", () => {
	assert.throws(
		() =>
			createCohortPlan(
				sha,
				baseSha,
				fixture({
					mutate: (manifests) => {
						manifests["packages/blog/package.json"].version = "1.2.0-beta.1";
					},
				}),
			),
		/channels/,
	);
	assert.throws(
		() =>
			createCohortPlan(
				sha,
				baseSha,
				fixture({
					mutate: (manifests) => {
						manifests["packages/blog/package.json"].dependencies = {
							"@btst/plugin-comments": "*",
						};
					},
				}),
			),
		/dependency order/,
	);
});

test("workflow receives a single-line cohort output from a real tagged candidate", async () => {
	const directory = await mkdtemp(join(tmpdir(), "btst-release-selection-"));
	const git = (...args) =>
		execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
	try {
		git("init", "-q");
		git("config", "user.name", "Release test");
		git("config", "user.email", "release-test@example.com");
		git("commit", "--allow-empty", "-qm", "Previous release");
		const base = git("rev-parse", "HEAD");
		for (const [path, manifest] of [
			["stack", { name: "@btst/stack", version: "6.3.0-beta.1" }],
			["cli", { name: "@btst/codegen", version: "6.3.0-beta.1" }],
		]) {
			await mkdir(join(directory, "packages", path), { recursive: true });
			await writeFile(
				join(directory, "packages", path, "package.json"),
				JSON.stringify(manifest),
			);
		}
		git("add", ".");
		git("commit", "-qm", "Candidate versions");
		const plan = createCohortPlan(git("rev-parse", "HEAD"), base, git);
		await mkdir(join(directory, ".github"));
		await writeFile(join(directory, planPath), JSON.stringify(plan));
		git("add", ".");
		git("commit", "-qm", "Release plan");
		for (const tag of plan.tags) git("tag", tag);
		const generated = execFileSync(
			process.execPath,
			[
				fileURLToPath(new URL("selection.mjs", import.meta.url)),
				"--plan",
				base,
			],
			{ cwd: directory, encoding: "utf8" },
		);
		assert.deepEqual(JSON.parse(generated), plan);
		const output = join(directory, "output");
		const result = execFileSync(
			process.execPath,
			[fileURLToPath(new URL("selection.mjs", import.meta.url))],
			{
				cwd: directory,
				encoding: "utf8",
				env: {
					...process.env,
					RELEASE_TAG: plan.primaryTag,
					RELEASE_TAGS: "",
					GITHUB_EVENT_NAME: "release",
					GITHUB_REF: `refs/tags/${plan.primaryTag}`,
					GITHUB_PRERELEASE: "true",
					GITHUB_OUTPUT: output,
				},
			},
		);
		assert.deepEqual(JSON.parse(result), plan.tags);
		assert.equal(
			await readFile(output, "utf8"),
			`tags=${JSON.stringify(plan.tags)}\n`,
		);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
