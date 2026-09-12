import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const bodyHash = (body) =>
	createHash("sha256")
		.update(body ?? "")
		.digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const demand = (condition, message) => {
	if (!condition) throw new Error(message);
};

// Follow every REST page, including comments on outdated diffs and old reviews.
export async function pages(api, path, key) {
	const result = [];
	for (let page = 1; ; page++) {
		const data = await api(
			`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
		);
		const items = key ? data[key] : data;
		demand(Array.isArray(items), `Invalid paginated response: ${path}`);
		result.push(...items);
		if (items.length < 100) return result;
	}
}

export function checkRun(run, jobs, expected, sha) {
	demand(
		run?.head_sha === sha &&
			run.status === "completed" &&
			run.conclusion === "success",
		`Workflow not successful on ${sha}: ${run?.html_url ?? "missing"}`,
	);
	for (const name of expected)
		demand(
			jobs.some((job) => job.name === name),
			`Missing expected job: ${name}`,
		);
	for (const job of jobs)
		demand(
			job.status === "completed" && job.conclusion === "success",
			`Job did not pass (skips are not success): ${job.html_url} ${job.name}: ${job.conclusion ?? job.status}`,
		);
}

// These provider-generated notices contain status, not code findings. Their
// changing timestamps/commit links must not require a new commit (which would
// itself change the notice). All review comments are still collected separately.
export function informationalNotice(comment) {
	const body = comment.body?.trim() ?? "";
	const login = comment.user?.login;
	if (
		login === "vercel[bot]" &&
		body.startsWith("[vc]: #") &&
		body.includes("The latest updates on your projects.")
	) {
		return "Vercel deployment status notice; actual deployment completion is checked independently for the candidate SHA.";
	}
	if (
		login === "chatgpt-codex-connector[bot]" &&
		body.startsWith("<!-- codex-pull-request-review-summary -->")
	) {
		const status = body.split("<details>")[0];
		demand(
			!/\b(pending|queued|running|in progress)\b/i.test(status),
			`Bot review is still pending: ${comment.html_url}`,
		);
		return "Codex review activity table; all review bodies and inline findings are collected and evaluated individually.";
	}
	if (
		login === "chatgpt-codex-connector[bot]" &&
		bodyHash(
			body.replace(/(\*\*Reviewed commit:\*\* `)[a-f0-9]+(`)/, "$1SHA$2"),
		) === "ff196be65094a06de60d0f863ff35152869c8b9092808be60716856ad527d3fd"
	) {
		return "Exact known Codex review boilerplate; the separately collected inline findings require fixes or dismissals.";
	}
	return undefined;
}

export function checkDisposition(comment, disposition, isAncestor) {
	demand(
		disposition && disposition.body_sha256 === bodyHash(comment.body),
		`Missing or stale bot disposition: ${comment.html_url}`,
	);
	demand(
		["fixed", "dismissed", "informational"].includes(disposition.disposition),
		`Invalid disposition: ${comment.html_url}`,
	);
	demand(
		typeof disposition.evidence === "string" &&
			disposition.evidence.trim().length >= 30,
		`Missing disposition evidence: ${comment.html_url}`,
	);
	if (disposition.disposition === "fixed")
		demand(
			/^[a-f0-9]{40}$/.test(disposition.fix_commit ?? "") &&
				isAncestor(disposition.fix_commit),
			`Fix is not in candidate ancestry: ${comment.html_url}`,
		);
	if (disposition.disposition === "informational")
		demand(
			informationalNotice(comment),
			`Unclassified bot comment requires a fix or dismissal: ${comment.html_url}`,
		);
}

export function checkDeployment(deployment, status, project) {
	demand(
		deployment &&
			status?.state === "success" &&
			status.description === "Deployment has completed" &&
			/^https:\/\//.test(status.environment_url ?? ""),
		`Missing completed deployment for ${project}; canceled/ignored builds do not pass`,
	);
}

export async function reviewThreads(graphql, owner, name, number) {
	const threads = [];
	let cursor = null;
	do {
		const data = await graphql({
			query: `query($owner:String!,$name:String!,$number:Int!,$cursor:String) {
			repository(owner:$owner,name:$name) { pullRequest(number:$number) {
				reviewThreads(first:100,after:$cursor) { nodes { id isResolved isOutdated } pageInfo { hasNextPage endCursor } }
			} }
		}`,
			variables: { owner, name, number, cursor },
		});
		demand(
			!data.errors && data.data?.repository?.pullRequest,
			`Unable to collect PR ${number} review threads`,
		);
		const connection = data.data.repository.pullRequest.reviewThreads;
		threads.push(...connection.nodes);
		cursor = connection.pageInfo.hasNextPage
			? connection.pageInfo.endCursor
			: null;
	} while (cursor);
	return threads;
}

export function checkBaseline(
	baseline,
	release,
	publication,
	registry,
	tagSha,
	isAncestor,
) {
	demand(
		baseline &&
			/^[a-f0-9]{40}$/.test(baseline.sha ?? "") &&
			baseline.sha === tagSha &&
			isAncestor(baseline.sha),
		"Unverified release baseline ancestry",
	);
	demand(
		release.tag_name === baseline.tag &&
			!release.draft &&
			!release.prerelease &&
			release.published_at,
		"Baseline is not a published stable GitHub release",
	);
	demand(
		publication.id === baseline.run_id &&
			publication.path === ".github/workflows/release.yml" &&
			publication.head_sha === baseline.sha &&
			publication.status === "completed" &&
			publication.conclusion === "success",
		"Baseline publication workflow did not succeed on its exact commit",
	);
	demand(
		registry.version === baseline.version &&
			registry.gitHead === baseline.sha &&
			registry.dist?.integrity === baseline.integrity,
		"Baseline package registry identity/integrity does not match successful publication",
	);
}

export function isPublicationCheck(
	check,
	run,
	repository,
	sha,
	publishingWorkflow,
) {
	const url = new URL(check.details_url ?? "https://invalid.example");
	return (
		url.origin === "https://github.com" &&
		url.pathname.startsWith(`/${repository}/actions/runs/${run.id}/`) &&
		check.app?.slug === "github-actions" &&
		run.repository?.full_name === repository &&
		run.head_sha === sha &&
		run.path === `.github/workflows/${publishingWorkflow}`
	);
}

export async function requireFreshEvidence(observe) {
	const first = await observe();
	const second = await observe();
	const firstHash = bodyHash(JSON.stringify(first));
	const secondHash = bodyHash(JSON.stringify(second));
	demand(
		firstHash === secondHash,
		"Gate evidence changed during collection; refresh after workflows and reviews settle",
	);
	return {
		verified_at: new Date().toISOString(),
		fingerprint: secondHash,
		observations: 2,
	};
}

// The candidate owns its workflow inventory. Main may add, rename, or remove
// workflows after publication; historical retries must still inspect this tree.
export function candidateWorkflows(sha, policy, readGit = git) {
	const paths = readGit(
		"ls-tree",
		"-r",
		"--name-only",
		sha,
		"--",
		".github/workflows",
	)
		.split("\n")
		.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path));
	const expected = [
		...Object.keys(policy.workflows),
		policy.publishing_workflow,
	].map((file) => `.github/workflows/${file}`);
	for (const path of paths)
		demand(expected.includes(path), `Unclassified candidate workflow: ${path}`);
	for (const path of expected)
		demand(paths.includes(path), `Missing candidate workflow: ${path}`);
	return paths.sort();
}

export function checkHeadReview(
	pr,
	issueComments,
	isAncestor,
	resolveCommit = (prefix) => git("rev-parse", `${prefix}^{commit}`),
) {
	demand(
		isAncestor(pr.head.sha),
		`PR head is outside the candidate: ${pr.html_url}`,
	);
	const summary = issueComments.find(
		(comment) =>
			comment.user?.login === "chatgpt-codex-connector[bot]" &&
			comment.body?.startsWith("<!-- codex-pull-request-review-summary -->"),
	);
	demand(summary, `Missing final-head Codex review: ${pr.html_url}`);
	informationalNotice(summary); // Pending reviews always block, even with older completion evidence.
	const rows = summary.body.split("<details>")[0].split("\n");
	const row = rows.find(
		(line) =>
			line.includes("**Code Review**") && line.includes("**Completed**"),
	);
	const abbreviated = row?.match(/`([a-f0-9]{7,40})`/)?.[1];
	demand(
		abbreviated &&
			pr.head.sha.startsWith(abbreviated) &&
			resolveCommit(abbreviated) === pr.head.sha,
		`Codex review has not completed for final PR head ${pr.head.sha}: ${pr.html_url}`,
	);
	return {
		head_sha: pr.head.sha,
		summary_url: summary.html_url,
		body_sha256: bodyHash(summary.body),
	};
}

export async function collect({
	api,
	graphql,
	repository,
	sha,
	policy,
	dispositions,
	prs,
	previousTag,
	isAncestor,
	receipt,
	readGit = git,
}) {
	const prefix = `/repos/${repository}`;
	receipt.candidate_workflows = candidateWorkflows(sha, policy, readGit);
	// Query runs by SHA, not the current workflow registry or mutable filenames.
	const candidateRuns = await pages(
		api,
		`${prefix}/actions/runs?head_sha=${sha}`,
		"workflow_runs",
	);
	receipt.previous_tag = previousTag;
	receipt.expected_workflows = policy.workflows;
	receipt.checks = [];
	for (const [file, expected] of Object.entries(policy.workflows)) {
		const runs = candidateRuns.filter(
			(run) => run.path === `.github/workflows/${file}` && run.head_sha === sha,
		);
		// A newer run or rerun invalidates prior success. Check every relevant latest
		// event run, and require a push/PR run (manual runs alone are insufficient).
		const latest = new Map();
		for (const run of runs.sort((a, b) => b.id - a.id))
			if (!latest.has(run.event)) latest.set(run.event, run);
		demand(
			latest.has("push") || latest.has("pull_request"),
			`Missing expected CI run: ${file} ${sha}`,
		);
		for (const run of latest.values()) {
			const jobs = await pages(
				api,
				`${prefix}/actions/runs/${run.id}/jobs?filter=latest`,
				"jobs",
			);
			receipt.checks.push({
				workflow: file,
				id: run.id,
				attempt: run.run_attempt,
				url: run.html_url,
				head_sha: run.head_sha,
				conclusion: run.conclusion,
				jobs: jobs.map(({ name, conclusion, html_url }) => ({
					name,
					conclusion,
					url: html_url,
				})),
			});
			checkRun(run, jobs, expected, sha);
		}
	}
	const checks = await pages(
		api,
		`${prefix}/commits/${sha}/check-runs?filter=latest`,
		"check_runs",
	);
	receipt.other_checks = checks.map(
		({ name, status, conclusion, html_url }) => ({
			name,
			status,
			conclusion,
			url: html_url,
		}),
	);
	receipt.excluded_publication_checks = [];
	const owners = new Map();
	for (const check of checks) {
		const runId = check.details_url?.match(/\/actions\/runs\/(\d+)\//)?.[1];
		if (runId && check.app?.slug === "github-actions") {
			if (!owners.has(runId))
				owners.set(runId, await api(`${prefix}/actions/runs/${runId}`));
			if (
				isPublicationCheck(
					check,
					owners.get(runId),
					repository,
					sha,
					policy.publishing_workflow,
				)
			) {
				receipt.excluded_publication_checks.push({
					id: check.id,
					url: check.html_url,
					run_id: runId,
					reason:
						"Publication result is verified after publishing; reconcile prior effects before retrying.",
				});
				continue;
			}
		}
		demand(
			check.status === "completed" && check.conclusion === "success",
			`Check did not pass: ${check.name} ${check.html_url}`,
		);
	}
	const statuses = await pages(api, `${prefix}/commits/${sha}/statuses`);
	const latestStatuses = new Map();
	for (const status of statuses)
		if (!latestStatuses.has(status.context))
			latestStatuses.set(status.context, status);
	receipt.statuses = [...latestStatuses.values()].map(
		({ context, state, target_url }) => ({ context, state, url: target_url }),
	);
	for (const status of latestStatuses.values())
		demand(
			status.state === "success",
			`Commit status did not pass: ${status.context} ${status.target_url}`,
		);
	const deployments = await pages(api, `${prefix}/deployments?sha=${sha}`);
	receipt.deployments = [];
	for (const project of policy.deployment_projects) {
		const deployment = deployments.find((item) =>
			item.environment.endsWith(` – ${project}`),
		);
		const status = deployment
			? (await pages(api, `${prefix}/deployments/${deployment.id}/statuses`))[0]
			: undefined;
		receipt.deployments.push({ project, id: deployment?.id, status });
		checkDeployment(deployment, status, project);
	}
	receipt.pull_requests = [];
	const [owner, name] = repository.split("/");
	for (const number of [
		...new Set([...prs, ...policy.additional_review_prs]),
	].sort((a, b) => a - b)) {
		const pr = await api(`${prefix}/pulls/${number}`);
		const comments = await pages(api, `${prefix}/pulls/${number}/comments`);
		const reviews = await pages(api, `${prefix}/pulls/${number}/reviews`);
		const issueComments = await pages(
			api,
			`${prefix}/issues/${number}/comments`,
		);
		const threads = await reviewThreads(graphql, owner, name, number);
		const botComments = [...comments, ...reviews, ...issueComments].filter(
			(item) =>
				(item.user?.type === "Bot" ||
					/\[bot\]$/.test(item.user?.login ?? "")) &&
				item.body?.trim(),
		);
		const entry = {
			number,
			url: pr.html_url,
			head_sha: pr.head.sha,
			threads,
			comment_count: comments.length,
			review_count: reviews.length,
			issue_comment_count: issueComments.length,
			bot_dispositions: [],
		};
		receipt.pull_requests.push(entry);
		if (prs.includes(number))
			entry.final_head_review = checkHeadReview(
				pr,
				issueComments,
				isAncestor,
				(prefix) => readGit("rev-parse", `${prefix}^{commit}`),
			);
		for (const comment of botComments) {
			const notice = informationalNotice(comment);
			const disposition = notice
				? {
						disposition: "informational",
						body_sha256: bodyHash(comment.body),
						evidence: notice,
					}
				: dispositions[comment.html_url];
			entry.bot_dispositions.push({
				url: comment.html_url,
				body_sha256: bodyHash(comment.body),
				disposition,
			});
			checkDisposition(comment, disposition, isAncestor);
		}
	}
}

async function main() {
	const args = process.argv.slice(2);
	const option = (name, fallback) =>
		args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
	const sha = git("rev-parse", `${option("--sha", "HEAD")}^{commit}`);
	const repository = option(
		"--repository",
		process.env.GITHUB_REPOSITORY ?? "better-stack-ai/better-stack",
	);
	const output = option("--output", "release-gate-receipt.json");
	const receipt = {
		candidate_sha: sha,
		repository,
		collected_at: new Date().toISOString(),
		passed: false,
	};
	try {
		const policy = JSON.parse(git("show", `${sha}:.github/release-gate.json`));
		const dispositions = JSON.parse(
			git("show", `${sha}:.github/review-dispositions.json`),
		);
		const baseline = policy.previous_release;
		const previousTag = baseline?.tag;
		demand(previousTag, "Missing verified publication baseline");
		const isAncestor = (commit) => {
			try {
				git("merge-base", "--is-ancestor", commit, sha);
				return true;
			} catch {
				return false;
			}
		};
		const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
		demand(token, "GH_TOKEN or GITHUB_TOKEN is required");
		const request = async (path, body) => {
			const response = await fetch(`https://api.github.com${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				signal: AbortSignal.timeout(30000),
			});
			demand(response.ok, `GitHub API ${response.status}: ${path}`);
			return response.json();
		};
		const release = await request(
			`/repos/${repository}/releases/tags/${previousTag}`,
		);
		const publication = await request(
			`/repos/${repository}/actions/runs/${baseline.run_id}`,
		);
		const registryResponse = await fetch(
			`https://registry.npmjs.org/@btst%2fstack/${baseline.version}`,
			{ signal: AbortSignal.timeout(30000) },
		);
		demand(
			registryResponse.ok,
			`Unable to verify baseline npm package: ${registryResponse.status}`,
		);
		const registry = await registryResponse.json();
		checkBaseline(
			baseline,
			release,
			publication,
			registry,
			git("rev-parse", `${previousTag}^{commit}`),
			isAncestor,
		);
		receipt.baseline = {
			...baseline,
			release_url: release.html_url,
			publication_url: publication.html_url,
			verified_at: new Date().toISOString(),
		};
		const prs = [];
		for (const commit of git("rev-list", `${baseline.sha}..${sha}`)
			.split("\n")
			.filter(Boolean)) {
			for (const pr of await pages(
				request,
				`/repos/${repository}/commits/${commit}/pulls`,
			))
				prs.push(pr.number);
		}
		demand(prs.length > 0, "Release candidate has no associated reviewed PR");
		receipt.freshness = await requireFreshEvidence(async () => {
			const evidence = {};
			try {
				await collect({
					api: request,
					graphql: (body) => request("/graphql", body),
					repository,
					sha,
					policy,
					dispositions,
					prs,
					previousTag,
					isAncestor,
					receipt: evidence,
				});
			} finally {
				Object.assign(receipt, evidence);
			}
			return evidence;
		});
		receipt.passed = true;
	} catch (error) {
		receipt.error = error.message;
		process.exitCode = 1;
	} finally {
		receipt.finished_at = new Date().toISOString();
		await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
		console.log(
			JSON.stringify({
				passed: receipt.passed,
				sha,
				output,
				error: receipt.error,
			}),
		);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	await main();
