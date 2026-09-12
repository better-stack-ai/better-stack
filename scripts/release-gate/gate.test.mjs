import { test } from "node:test";
import assert from "node:assert/strict";
import {
	candidateWorkflows,
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
