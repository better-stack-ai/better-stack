import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	candidateWorkflows,
	publicationAncestry,
	publicationSources,
	collect,
	isPublicationCheck,
	requireFreshEvidence,
	checkRun,
	checkDeployment,
	pages,
} from "./gate.mjs";

const sha = "a".repeat(40);
const run = {
	head_sha: sha,
	status: "completed",
	conclusion: "success",
	html_url: "https://example/run",
};
const job = {
	name: "test",
	status: "completed",
	conclusion: "success",
	html_url: "https://example/job",
};

test("only successful runs on the exact candidate with every expected job pass", () => {
	checkRun(run, [job], ["test"], sha);
	assert.throws(() =>
		checkRun({ ...run, head_sha: "b".repeat(40) }, [job], ["test"], sha),
	);
	assert.throws(() => checkRun(undefined, [], ["test"], sha));
	assert.throws(() => checkRun(run, [], ["test"], sha));
	for (const conclusion of [
		null,
		"failure",
		"cancelled",
		"timed_out",
		"skipped",
		"neutral",
		"action_required",
	]) {
		assert.throws(() => checkRun({ ...run, conclusion }, [job], ["test"], sha));
		assert.throws(() => checkRun(run, [{ ...job, conclusion }], ["test"], sha));
	}
	assert.throws(() =>
		checkRun(
			run,
			[job, { ...job, name: "new-check", conclusion: "failure" }],
			["test"],
			sha,
		),
	);
	assert.throws(() =>
		checkRun({ ...run, status: "in_progress" }, [job], ["test"], sha),
	);
});

test("canceled or absent deployments cannot masquerade as green commit statuses", () => {
	const deployment = { id: 1 };
	const status = {
		state: "success",
		description: "Deployment has completed",
		environment_url: "https://example/deployment",
	};
	checkDeployment(deployment, status, "docs");
	for (const state of ["pending", "failure", "error", "inactive"])
		assert.throws(() =>
			checkDeployment(deployment, { ...status, state }, "docs"),
		);
	assert.throws(() =>
		checkDeployment(
			deployment,
			{ ...status, description: "Deployment was canceled" },
			"docs",
		),
	);
	assert.throws(() => checkDeployment(undefined, undefined, "docs"));
});

test("reruns and deployment changes invalidate otherwise successful observations", async () => {
	const original = {
		checks: [{ attempt: 1, conclusion: "success" }],
	};
	for (const changed of [
		{ ...original, checks: [{ attempt: 2, conclusion: null }] },
		{ ...original, deployments: [{ state: "failure" }] },
	]) {
		let count = 0;
		await assert.rejects(
			requireFreshEvidence(async () => (count++ === 0 ? original : changed)),
			/changed during collection/,
		);
	}
	assert.equal(
		(await requireFreshEvidence(async () => original)).observations,
		2,
	);
});

test("publication retries are excluded by authenticated ownership, not check name or current run ID", () => {
	const repository = "owner/repo";
	const check = {
		name: "release",
		app: { slug: "github-actions" },
		details_url: "https://github.com/owner/repo/actions/runs/12/job/34",
		conclusion: "failure",
	};
	const publication = {
		id: 12,
		repository: { full_name: repository },
		head_sha: sha,
		path: ".github/workflows/release.yml",
	};
	assert.equal(
		isPublicationCheck(check, publication, repository, sha, "release.yml"),
		true,
	);
	assert.equal(
		isPublicationCheck(
			check,
			{ ...publication, path: ".github/workflows/ci.yml" },
			repository,
			sha,
			"release.yml",
		),
		false,
	);
	assert.equal(
		isPublicationCheck(
			{ ...check, app: { slug: "untrusted" } },
			publication,
			repository,
			sha,
			"release.yml",
		),
		false,
	);
	assert.equal(
		isPublicationCheck(
			check,
			{ ...publication, head_sha: "b".repeat(40) },
			repository,
			sha,
			"release.yml",
		),
		false,
	);
});

test("historical candidate inventory and runs survive later main workflow changes", async () => {
	const policy = {
		workflows: { "old-name.yml": ["test"] },
		publishing_workflow: "release.yml",
		deployment_projects: [],
	};
	const candidateTree =
		".github/workflows/old-name.yml\n.github/workflows/release.yml";
	const calls = [];
	const api = async (path) => {
		calls.push(path);
		if (path.includes("/actions/workflows"))
			throw new Error("Must not consult main's renamed/new/deleted workflows");
		if (path.includes("/actions/runs?"))
			return {
				workflow_runs: [
					{
						...run,
						id: 1,
						event: "push",
						path: ".github/workflows/old-name.yml",
					},
				],
			};
		if (path.includes("/jobs?")) return { jobs: [job] };
		if (path.includes("/check-runs?")) return { check_runs: [] };
		return [];
	};
	const readGit = (...args) => {
		assert.deepEqual(args, [
			"ls-tree",
			"-r",
			"--name-only",
			sha,
			"--",
			".github/workflows",
		]);
		return candidateTree;
	};
	const receipt = {};
	await collect({
		api,

		repository: "owner/repo",
		sha,
		policy,

		receipt,
		readGit,
	});
	assert.equal(receipt.checks[0].conclusion, "success");
	assert.ok(
		calls.some((path) => path.includes(`/actions/runs?head_sha=${sha}`)),
	);
	assert.throws(
		() =>
			candidateWorkflows(
				sha,
				policy,
				() => candidateTree + "\n.github/workflows/unclassified.yaml",
			),
		/Unclassified candidate/,
	);
	assert.throws(
		() =>
			candidateWorkflows(sha, policy, () => ".github/workflows/release.yml"),
		/Missing candidate/,
	);
	await assert.rejects(
		collect({
			api: async (path) =>
				path.includes("/actions/runs?") ? { workflow_runs: [] } : api(path),

			repository: "owner/repo",
			sha,
			policy,

			receipt: {},
			readGit,
		}),
		/Missing expected CI run/,
	);
});

test("pagination includes failed checks beyond the first 100 results", async () => {
	const checks = await pages(
		async (path) => ({
			check_runs: path.endsWith("page=1")
				? Array(100).fill({ conclusion: "success" })
				: [{ conclusion: "failure" }],
		}),
		"/checks",
		"check_runs",
	);
	assert.equal(checks.length, 101);
	assert.equal(checks[100].conclusion, "failure");
});

test("stable publication rejects divergent history and preserves descendants and reconciled retries", async () => {
	const directory = mkdtempSync(join(tmpdir(), "btst-publication-"));
	const git = (...args) =>
		execFileSync("git", args, {
			cwd: directory,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	try {
		git("init", "-q", "-b", "main");
		git("config", "user.name", "Publication regression");
		git("config", "user.email", "test@example.invalid");
		mkdirSync(join(directory, "packages/stack"), { recursive: true });
		const commit = (version) => {
			writeFileSync(
				join(directory, "packages/stack/package.json"),
				JSON.stringify({ name: "@btst/stack", version }),
			);
			git("add", ".");
			git("commit", "-qm", version);
			return git("rev-parse", "HEAD");
		};
		const root = commit("1.0.0");
		const previous = commit("1.1.0");
		const descendant = commit("1.2.0");
		git("checkout", "--detach", root);
		const divergent = commit("1.2.0");
		const published = {
			name: "@btst/stack",
			version: "1.1.0",
			gitHead: previous,
			dist: { integrity: "sha512-fixture" },
		};
		const registry = async (_name, version) =>
			version === "latest" ? published : null;
		const check = (candidate, overrides = {}) =>
			publicationAncestry({
				packageName: "@btst/stack",
				distTag: "latest",
				sha: candidate,
				registry,
				readGit: git,
				...overrides,
			});
		// Both candidates can have green CI; their actual Git ancestry differs.
		checkRun({ ...run, head_sha: divergent }, [job], ["test"], divergent);
		await assert.rejects(check(divergent), /does not include published/);
		assert.equal(
			(await check(descendant)).outcome,
			"published-source-is-ancestor",
		);
		assert.equal(
			(
				await check(divergent, {
					distTag: "next",
					registry: async (_name, version) => {
						return version === "latest" ? published : null;
					},
				})
			).outcome,
			"prerelease-channel",
		);
		const existing = { ...published, version: "1.2.0", gitHead: descendant };
		await assert.rejects(
			check(descendant, {
				registry: async (_name, version) =>
					version === "1.2.0" ? existing : published,
			}),
			/not selected by requested latest/,
		);
		await assert.rejects(
			check(descendant, {
				registry: async (_name, version) => {
					if (version === "latest") throw new Error("Requested tag missing");
					return existing;
				},
			}),
			/Requested tag missing/,
		);
		await assert.rejects(
			check(descendant, { distTag: "next", registry: async () => existing }),
			/leave latest on a different stable version/,
		);
		git("checkout", "--detach", root);
		const betaSha = commit("1.3.0-beta.1");
		const beta = { ...published, version: "1.3.0-beta.1", gitHead: betaSha };
		await assert.rejects(
			check(descendant, {
				registry: async (_name, version) =>
					version === "latest" ? beta : null,
			}),
			/latest must identify a stable package/,
		);
		await assert.rejects(
			check(descendant, { distTag: "next", registry: async () => beta }),
			/leave latest on a different stable version/,
		);

		await assert.rejects(
			check(divergent, { registry: async () => existing }),
			/belongs to another commit/,
		);
		const calls = [];
		await assert.rejects(
			publicationSources({
				packageName: "all",
				distTag: "latest",
				sha: divergent,
				readGit: (command, ref, ...args) => {
					if (command === "show" && ref.endsWith("packages/cli/package.json"))
						return JSON.stringify({ name: "@btst/codegen", version: "0.2.0" });
					return git(command, ref, ...args);
				},
				registry: async (name) => {
					calls.push(name);
					return name === "@btst/stack"
						? { ...existing, gitHead: divergent }
						: {
								name,
								version: "0.2.0",
								gitHead: previous,
								dist: { integrity: "sha512-fixture" },
							};
				},
			}),
			/belongs to another commit/,
		);
		assert.deepEqual(
			calls,
			["@btst/stack", "@btst/stack", "@btst/codegen"],
			"The second package source is checked during the preflight",
		);

		assert.equal(
			(
				await check(descendant, {
					registry: async (_name, version) => {
						assert.ok(["1.2.0", "latest"].includes(version));
						return existing;
					},
				})
			).outcome,
			"already-published",
		);
		await assert.rejects(
			check(descendant, {
				registry: async (_name, version) =>
					version === "latest" ? { ...published, gitHead: root } : null,
			}),
			/does not match repository/,
		);
		await assert.rejects(
			check(descendant, {
				registry: async (_name, version) =>
					version === "latest" ? { ...published, gitHead: undefined } : null,
			}),
			/source identity/,
		);
		await assert.rejects(
			check(descendant, {
				registry: async () => ({ ...existing, version: "9.0.0" }),
			}),
			/version mismatch/,
		);
		await assert.rejects(
			check(descendant, { packageName: "unrecognized" }),
			/Unknown publication package/,
		);
		await assert.rejects(
			check(descendant, { distTag: "invalid" }),
			/Unknown publication dist-tag/,
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
