import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const evidenceHash = (body) =>
	createHash("sha256")
		.update(body ?? "")
		.digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const demand = (condition, message) => {
	if (!condition) throw new Error(message);
};

// Follow every REST page so late jobs, checks, and deployments are inspected.
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

export function checkDeployment(deployment, status, project) {
	demand(
		deployment &&
			status?.state === "success" &&
			status.description === "Deployment has completed" &&
			/^https:\/\//.test(status.environment_url ?? ""),
		`Missing completed deployment for ${project}; canceled/ignored builds do not pass`,
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
	const firstHash = evidenceHash(JSON.stringify(first));
	const secondHash = evidenceHash(JSON.stringify(second));
	demand(
		firstHash === secondHash,
		"Gate evidence changed during collection; refresh after workflows and deployments settle",
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

export async function collect({
	api,
	repository,
	sha,
	policy,
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
}

// Publication safety is independent of PR review handling. Resolve the published
// source from npm instead of maintaining a release-history record in this repo.
export async function publicationAncestry({
	packageName,
	distTag,
	sha,
	registry,
	readGit = git,
}) {
	const path = {
		"@btst/stack": "packages/stack/package.json",
		"@btst/codegen": "packages/cli/package.json",
	}[packageName];
	demand(path, "Unknown publication package");
	demand(["latest", "next"].includes(distTag), "Unknown publication dist-tag");
	const candidate = JSON.parse(readGit("show", `${sha}:${path}`));
	demand(
		candidate.name === packageName && typeof candidate.version === "string",
		"Candidate package identity is invalid",
	);
	const verifySource = (published) => {
		demand(
			published?.name === packageName &&
				typeof published.version === "string" &&
				/^[a-f0-9]{40}$/.test(published.gitHead ?? "") &&
				published.dist?.integrity,
			"Published package source identity is unavailable",
		);
		const source = JSON.parse(readGit("show", `${published.gitHead}:${path}`));
		demand(
			source.name === packageName && source.version === published.version,
			"Published package source does not match repository package identity",
		);
		return {
			version: published.version,
			sha: published.gitHead,
			integrity: published.dist.integrity,
		};
	};
	const existing = await registry(packageName, candidate.version, true);
	if (existing) {
		demand(
			existing.version === candidate.version,
			"Existing package version mismatch",
		);
		return {
			package: packageName,
			version: candidate.version,
			dist_tag: distTag,
			outcome: "already-published",
			source: verifySource(existing),
		};
	}
	if (distTag === "next")
		return {
			package: packageName,
			version: candidate.version,
			dist_tag: distTag,
			outcome: "prerelease-channel",
		};
	const previous = verifySource(await registry(packageName, "latest", false));
	let includesPublishedSource = false;
	try {
		readGit("merge-base", "--is-ancestor", previous.sha, sha);
		includesPublishedSource = true;
	} catch {}
	demand(
		includesPublishedSource,
		`Candidate does not include published ${packageName}@${previous.version}`,
	);
	return {
		package: packageName,
		version: candidate.version,
		dist_tag: distTag,
		outcome: "published-source-is-ancestor",
		previous,
	};
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
	const packageName = option("--publishing");
	const distTag = option("--dist-tag");
	const receipt = {
		candidate_sha: sha,
		repository,
		collected_at: new Date().toISOString(),
		passed: false,
		verification:
			"CI, deployments and requested publication ancestry; the responsible agent separately checks PR review comments",
	};
	try {
		const policy = JSON.parse(git("show", `${sha}:.github/release-gate.json`));
		const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
		demand(token, "GH_TOKEN or GITHUB_TOKEN is required");
		const request = async (path) => {
			const response = await fetch(`https://api.github.com${path}`, {
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
				signal: AbortSignal.timeout(30000),
			});
			demand(response.ok, `GitHub API ${response.status}: ${path}`);
			return response.json();
		};
		const registry = async (name, version, allowMissing) => {
			const response = await fetch(
				`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
				{ signal: AbortSignal.timeout(30000) },
			);
			if (allowMissing && response.status === 404) return null;
			demand(
				response.ok,
				`Unable to verify published ${name}@${version}: ${response.status}`,
			);
			return response.json();
		};
		receipt.freshness = await requireFreshEvidence(async () => {
			const evidence = {};
			try {
				await collect({
					api: request,
					repository,
					sha,
					policy,
					receipt: evidence,
				});
				if (packageName)
					evidence.publication = await publicationAncestry({
						packageName,
						distTag,
						sha,
						registry,
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
