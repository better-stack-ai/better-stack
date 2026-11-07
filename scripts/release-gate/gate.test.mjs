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
	publicationReadiness,
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

test("new package readiness reports missing provisioning without authorizing publication", async () => {
	const packageName = "@btst/plugin-blog";
	const options = {
		packageName,
		distTag: "latest",
		sha,
		readGit: (command, ref) =>
			command === "ls-tree"
				? "packages/plugin-blog/package.json"
				: JSON.stringify({ name: packageName, version: "1.0.0" }),
		registry: async (_name, _version, allowMissing) => {
			if (allowMissing) return null;
			throw new Error("Package unavailable");
		},
	};
	assert.deepEqual(await publicationReadiness(options), {
		package: packageName,
		version: "1.0.0",
		dist_tag: "latest",
		outcome: "unprovisioned",
		publication_ready: false,
	});
	await assert.rejects(
		publicationAncestry(options),
		/verified prerelease-only history/,
	);
	await assert.rejects(
		publicationReadiness({
			...options,
			registry: async () => {
				throw new Error("Registry unavailable");
			},
		}),
		/Registry unavailable/,
	);
});

test("initial and subsequent betas require verified prerelease-only history", async () => {
	const packageName = "@btst/plugin-blog";
	const path = "packages/plugin-blog/package.json";
	const previousSha = "b".repeat(40);
	const previous = {
		name: packageName,
		version: "1.0.0-beta.0",
		gitHead: previousSha,
		dist: { integrity: "sha512-beta0" },
	};
	const options = {
		packageName,
		distTag: "next",
		sha,
		readGit: (command, ref) =>
			command === "ls-tree"
				? path
				: command === "show"
					? JSON.stringify({
							name: packageName,
							version: ref.startsWith(previousSha)
								? previous.version
								: "1.0.0-beta.1",
						})
					: "",
		registry: async () => null,
	};
	const first = await publicationAncestry(options);
	assert.equal(first.outcome, "initial-prerelease");
	assert.equal(first.initialPrerelease, true);
	assert.equal(
		(await publicationReadiness(options)).outcome,
		"initial-prerelease",
	);
	const metadata = {
		name: packageName,
		versions: { [previous.version]: previous },
	};
	for (const latest of [null, previous]) {
		const next = await publicationAncestry({
			...options,
			registry: async (_name, version) =>
				version === undefined ? metadata : version === "latest" ? latest : null,
		});
		assert.equal(next.outcome, "initial-prerelease");
		assert.equal(next.initialPrerelease, true);
	}
	for (const changed of [
		{ ...previous, version: "1.0.0" },
		{ ...previous, gitHead: undefined },
		{ ...previous, name: "@btst/plugin-cms" },
	]) {
		await assert.rejects(
			publicationAncestry({
				...options,
				registry: async (_name, version) =>
					version === undefined
						? { name: packageName, versions: { [changed.version]: changed } }
						: null,
			}),
		);
	}
	await assert.rejects(
		publicationAncestry({
			...options,
			registry: async (_name, version) =>
				version === undefined ? metadata : null,
			readGit: (command, ...args) => {
				if (command === "merge-base") throw new Error("Foreign history");
				return options.readGit(command, ...args);
			},
		}),
		/does not include published/,
	);
});

test("first stable publication requires verified prerelease-only ancestry", async () => {
	const packageName = "@btst/plugin-blog";
	const path = "packages/plugin-blog/package.json";
	const previousSha = "b".repeat(40);
	const previous = {
		name: packageName,
		version: "1.0.0-beta.0",
		gitHead: previousSha,
		dist: { integrity: "sha512-beta0" },
	};
	const options = {
		packageName,
		distTag: "latest",
		sha,
		readGit: (command, ref) =>
			command === "ls-tree"
				? path
				: command === "show"
					? JSON.stringify({
							name: packageName,
							version: ref.startsWith(previousSha) ? previous.version : "1.0.0",
						})
					: "",
	};
	for (const latest of [null, previous]) {
		const registry = async (_name, version) =>
			version === undefined
				? { name: packageName, versions: { [previous.version]: previous } }
				: version === "latest"
					? latest
					: null;
		for (const check of [publicationAncestry, publicationReadiness]) {
			const result = await check({ ...options, registry });
			assert.equal(result.outcome, "first-stable-from-prereleases");
			assert.deepEqual(result.previousPrereleases, [
				{
					version: previous.version,
					sha: previousSha,
					integrity: previous.dist.integrity,
				},
			]);
		}
	}
	for (const metadata of [
		null,
		{ name: packageName, versions: {} },
		{ name: "@btst/plugin-cms", versions: { [previous.version]: previous } },
		{
			name: packageName,
			versions: {
				[previous.version]: previous,
				"0.9.0": { ...previous, version: "0.9.0" },
			},
		},
	])
		await assert.rejects(
			publicationAncestry({
				...options,
				registry: async (_name, version) =>
					version === undefined ? metadata : null,
			}),
			/verified prerelease-only history/,
		);
	for (const changed of [
		{ ...previous, gitHead: undefined },
		{ ...previous, dist: {} },
		{ ...previous, name: "@btst/plugin-cms" },
		{ ...previous, version: "1.0.0-beta.uncommitted" },
	])
		await assert.rejects(
			publicationAncestry({
				...options,
				registry: async (_name, version) =>
					version === undefined
						? { name: packageName, versions: { [changed.version]: changed } }
						: null,
			}),
			/Published package source/,
		);
	const metadata = {
		name: packageName,
		versions: { [previous.version]: previous },
	};
	const registry = async (_name, version) =>
		version === undefined ? metadata : version === "latest" ? previous : null;
	await assert.rejects(
		publicationAncestry({
			...options,
			registry: async (_name, version) =>
				version === "latest"
					? { ...previous, dist: { integrity: "sha512-foreign" } }
					: registry(_name, version),
		}),
		/Prerelease latest does not match/,
	);
	const other = {
		...previous,
		version: "1.0.0-beta.1",
		gitHead: "c".repeat(40),
	};
	await assert.rejects(
		publicationAncestry({
			...options,
			registry: async (_name, version) =>
				version === undefined
					? {
							name: packageName,
							versions: { ...metadata.versions, [other.version]: other },
						}
					: registry(_name, version),
			readGit: (command, ...args) => {
				if (command === "merge-base" && args[1] === other.gitHead)
					throw new Error("Foreign history");
				if (command === "show" && args[0].startsWith(other.gitHead))
					return JSON.stringify({ name: packageName, version: other.version });
				return options.readGit(command, ...args);
			},
		}),
		/does not include published/,
	);
});

test("plugin and CLI publication retain source ancestry, exact retries and their own stable channels", async () => {
	for (const [packageName, path] of [
		["@btst/plugin-blog", "packages/plugin-blog/package.json"],
		["@btst/codegen", "packages/cli/package.json"],
	]) {
		const previousSha = "b".repeat(40);
		const otherSha = "c".repeat(40);
		let version = "2.0.0";
		const readGit = (command, ref) =>
			command === "ls-tree"
				? path
				: command === "show"
					? JSON.stringify({
							name: packageName,
							version: ref.startsWith(previousSha) ? "1.0.0" : version,
						})
					: "";
		const previous = {
			name: packageName,
			version: "1.0.0",
			gitHead: previousSha,
			dist: { integrity: "sha512-old" },
		};
		const options = {
			packageName,
			distTag: "latest",
			sha,
			readGit,
			registry: async (name, requested) => {
				assert.equal(name, packageName);
				return requested === "latest" ? previous : null;
			},
		};
		assert.equal(
			(await publicationAncestry(options)).outcome,
			"published-source-is-ancestor",
		);
		await assert.rejects(
			publicationAncestry({
				...options,
				readGit: (command, ...args) => {
					if (command === "merge-base") throw new Error("Divergent");
					return readGit(command, ...args);
				},
			}),
			/does not include published/,
		);
		const existing = {
			name: packageName,
			version,
			gitHead: sha,
			dist: { integrity: "sha512-new" },
		};
		assert.equal(
			(
				await publicationAncestry({
					...options,
					registry: async () => existing,
				})
			).outcome,
			"already-published",
		);
		await assert.rejects(
			publicationAncestry({
				...options,
				registry: async () => ({ ...existing, gitHead: otherSha }),
			}),
			/belongs to another commit/,
		);
		for (const tag of [
			previous,
			{ ...existing, dist: { integrity: "sha512-wrong" } },
		]) {
			await assert.rejects(
				publicationAncestry({
					...options,
					registry: async (_name, requested) =>
						requested === "latest" ? tag : existing,
				}),
				/not selected by requested latest/,
			);
		}
		version = "2.1.0-next.0";
		assert.equal(
			(await publicationAncestry({ ...options, distTag: "next" })).stable.sha,
			previousSha,
		);
		await assert.rejects(
			publicationAncestry({
				...options,
				distTag: "next",
				registry: async () => ({ ...existing, version }),
			}),
			/leave latest on a different stable version/,
		);
	}
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

test("run ownership reuses each fresh candidate listing without carrying authorization between observations", async () => {
	const repository = "owner/repo";
	const workflow = ".github/workflows/ci.yml";
	const verified = {
		...run,
		id: 20,
		event: "pull_request",
		path: workflow,
		repository: { full_name: repository },
	};
	let changed = false;
	let listings = 0;
	const observe = async () => {
		const receipt = {};
		await collect({
			repository,
			sha,
			receipt,
			policy: {
				workflows: { "ci.yml": ["test"] },
				publishing_workflow: "release.yml",
				deployment_projects: [],
			},
			readGit: () => `${workflow}\n.github/workflows/release.yml`,
			api: async (path) => {
				if (path.includes("/actions/runs?")) {
					listings++;
					return {
						workflow_runs: [
							verified,
							{
								...verified,
								id: 10,
								conclusion: "cancelled",
								repository: { full_name: changed ? "other/repo" : repository },
							},
						],
					};
				}
				if (path.includes("/jobs?")) return { jobs: [job] };
				if (path.includes("/check-runs?"))
					return {
						check_runs: [
							{
								id: 30,
								app: { slug: "github-actions" },
								status: "completed",
								conclusion: "cancelled",
								details_url:
									"https://github.com/owner/repo/actions/runs/10/job/30",
							},
						],
					};
				if (path.includes("/statuses?") || path.includes("/deployments?"))
					return [];
				throw new Error(`Redundant ownership request: ${path}`);
			},
		});
		return receipt;
	};
	assert.equal((await observe()).superseded_checks.length, 1);
	changed = true;
	await assert.rejects(observe(), /Check did not pass/);
	assert.equal(listings, 2);
});

test("only authenticated checks superseded by a verified run or attempt may be excluded", async () => {
	const repository = "owner/repo";
	const workflow = ".github/workflows/packed-consumers.yml";
	const verified = {
		...run,
		id: 20,
		run_attempt: 2,
		event: "pull_request",
		path: workflow,
		repository: { full_name: repository },
	};
	const owner = {
		...verified,
		id: 10,
		run_attempt: 1,
		conclusion: "cancelled",
	};
	const check = {
		id: 30,
		name: "Consumers ${{ matrix.shard }} (${{ matrix.package-manager }})",
		app: { slug: "github-actions" },
		status: "completed",
		conclusion: "cancelled",
		details_url: "https://github.com/owner/repo/actions/runs/10/job/30",
	};
	async function evidence(options = {}) {
		const current = { ...verified, ...options.verified };
		const previous = { ...owner, ...options.owner };
		const receipt = {};
		await collect({
			repository,
			sha,
			receipt,
			policy: {
				workflows: { "packed-consumers.yml": ["test"] },
				publishing_workflow: "release.yml",
				deployment_projects: [],
			},
			readGit: () => `${workflow}\n.github/workflows/release.yml`,
			api: async (path) => {
				if (path.includes("/actions/runs?"))
					return { workflow_runs: [current] };
				if (path.includes("/jobs?"))
					return { jobs: [{ ...job, ...options.job }] };
				if (path.includes("/check-runs?"))
					return { check_runs: [{ ...check, ...options.check }] };
				if (
					path.endsWith("/actions/runs/10") ||
					path.endsWith("/actions/runs/20")
				)
					return previous;
				if (path.endsWith("/actions/jobs/30"))
					return {
						run_id: 20,
						head_sha: sha,
						run_attempt: 1,
						...options.previousJob,
					};
				if (path.includes("/statuses?") || path.includes("/deployments?"))
					return [];
				throw new Error(`Unexpected API request: ${path}`);
			},
		});
		return receipt;
	}
	const receipt = await evidence();
	assert.deepEqual(
		receipt.superseded_checks.map(({ id, superseded_by }) => ({
			id,
			superseded_by,
		})),
		[{ id: 30, superseded_by: 20 }],
	);
	const retry = {
		owner: { id: 20, run_attempt: 2, conclusion: "success" },
		check: {
			details_url: "https://github.com/owner/repo/actions/runs/20/job/30",
		},
	};
	assert.equal((await evidence(retry)).superseded_checks.length, 1);
	for (const options of [
		{ owner: { repository: { full_name: "other/repo" } } },
		{ owner: { head_sha: "b".repeat(40) } },
		{ owner: { path: ".github/workflows/other.yml" } },
		{ owner: { event: "workflow_dispatch" } },
		{ owner: { id: 21 } },
		{ check: { app: { slug: "other-app" } } },
		{
			check: {
				details_url:
					"https://attacker.example/owner/repo/actions/runs/10/job/30",
			},
		},
		{ ...retry, previousJob: { run_attempt: 2 } },
		{ ...retry, previousJob: { run_attempt: 0 } },
		{ ...retry, previousJob: { run_id: 21 } },
		{ ...retry, previousJob: { head_sha: "b".repeat(40) } },
	]) {
		await assert.rejects(evidence(options), /Check did not pass/);
	}
	for (const conclusion of ["failure", "skipped", "cancelled"]) {
		await assert.rejects(
			evidence({ verified: { conclusion } }),
			/Workflow not successful/,
		);
		await assert.rejects(evidence({ job: { conclusion } }), /Job did not pass/);
	}
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
			/verified prerelease-only history/,
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
					if (command === "ls-tree")
						return "packages/stack/package.json\npackages/cli/package.json";
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
