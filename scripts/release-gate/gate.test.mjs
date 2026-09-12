import { test } from "node:test";
import assert from "node:assert/strict";
import {
	bodyHash,
	informationalNotice,
	checkRun,
	checkDisposition,
	checkDeployment,
	pages,
	reviewThreads,
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

test("all comment pages are inspected, including a finding after the first 100", async () => {
	const calls = [];
	const result = await pages(async (path) => {
		calls.push(path);
		return path.endsWith("page=1")
			? Array(100).fill({ id: 1 })
			: [{ id: 101, body: "P1: late finding" }];
	}, "/comments");
	assert.equal(result.length, 101);
	assert.equal(calls.length, 2);
	assert.throws(() => checkDisposition(result[100], undefined, () => true));
});

test("thread pagination includes outdated and unresolved findings", async () => {
	const cursors = [];
	const threads = await reviewThreads(
		async ({ variables }) => {
			cursors.push(variables.cursor);
			return {
				data: {
					repository: {
						pullRequest: {
							reviewThreads: {
								nodes: [
									{
										id: variables.cursor ?? "first",
										isOutdated: true,
										isResolved: false,
									},
								],
								pageInfo: {
									hasNextPage: variables.cursor === null,
									endCursor: "second",
								},
							},
						},
					},
				},
			};
		},
		"owner",
		"repo",
		1,
	);
	assert.deepEqual(cursors, [null, "second"]);
	assert.equal(threads.length, 2);
});

test("resolved flags and summaries do not replace an evidenced disposition", () => {
	const comment = {
		body: "P1: missing static identity",
		html_url: "https://example/finding",
		resolved: true,
	};
	const disposition = {
		body_sha256: bodyHash(comment.body),
		disposition: "fixed",
		fix_commit: sha,
		evidence:
			"Regression test executes the generated layout and checks public HTML and hydrated session.",
	};
	checkDisposition(comment, disposition, () => true);
	assert.throws(() => checkDisposition(comment, undefined, () => true));
	assert.throws(() =>
		checkDisposition(
			comment,
			{ ...disposition, evidence: "fixed" },
			() => true,
		),
	);
	assert.throws(() => checkDisposition(comment, disposition, () => false));
	assert.throws(() =>
		checkDisposition(
			comment,
			{ ...disposition, disposition: "informational" },
			() => true,
		),
	);
	checkDisposition(
		comment,
		{ ...disposition, disposition: "dismissed" },
		() => true,
	);
	assert.throws(() =>
		checkDisposition(
			{ ...comment, body: `${comment.body} updated finding` },
			disposition,
			() => true,
		),
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

test("only known provider notices bypass manual dispositions, never inline findings", () => {
	assert.equal(
		informationalNotice({
			user: { login: "chatgpt-codex-connector[bot]" },
			body: "P1: bad code",
			html_url: "inline",
		}),
		undefined,
	);
	assert.equal(
		informationalNotice({
			user: { login: "other[bot]" },
			body: "<!-- codex-pull-request-review-summary -->",
		}),
		undefined,
	);
	assert.throws(() =>
		informationalNotice({
			user: { login: "chatgpt-codex-connector[bot]" },
			body: "<!-- codex-pull-request-review-summary -->\n| review | in progress |",
			html_url: "review",
		}),
	);
	assert.ok(
		informationalNotice({
			user: { login: "vercel[bot]" },
			body: "[vc]: #metadata\nThe latest updates on your projects.",
		}),
	);
});
