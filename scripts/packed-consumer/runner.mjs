import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire, isBuiltin } from "node:module";
import {
	cp,
	mkdtemp,
	mkdir,
	open,
	readFile,
	readdir,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { satisfies } from "semver";
import ts from "typescript";
import { inspectCandidate, packCandidate } from "../pack-candidate.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../..");
const FIXTURES_DIR = join(SCRIPT_DIR, "fixtures");

export const AUTH_COHORT = Object.freeze({
	"@better-auth/api-key": "1.7.14",
	"@better-auth/core": "1.7.14",
	"@better-auth/passkey": "1.7.14",
	"@better-auth/utils": "0.5.1",
	"@better-fetch/fetch": "1.3.3",
	"@btst/db": "3.0.1",
	"better-auth": "1.7.14",
	"better-call": "1.4.4",
});

// Optional Auth integrations may use separate implementation versions.
// Auth/Core/DB must share the exact cohort; peer validation stays strict.
const DUPLICATE_TOLERANT_AUTH_PACKAGES = new Set([
	"better-call",
	"@better-auth/utils",
]);

function pickVersions(source, names) {
	return Object.fromEntries(names.map((name) => [name, source[name]]));
}

const TESTED_DEPENDENCY_VERSIONS = Object.freeze({
	"@btst/adapter-memory": "3.0.1",
	"@ai-sdk/react": "4.0.159",
	// Exercise @btst/db's published exact peer contract explicitly. These are
	// documented peers of @btst/db/Core, not workaround pins for the fixture.
	...pickVersions(AUTH_COHORT, [
		"@better-auth/core",
		"@better-auth/utils",
		"@better-fetch/fetch",
		"@btst/db",
		"better-auth",
		"better-call",
	]),
	"@btst/yar": "1.3.2",
	"@hookform/resolvers": "5.2.2",
	"@radix-ui/react-dialog": "1.1.15",
	"@radix-ui/react-label": "2.1.8",
	"@radix-ui/react-slot": "1.2.4",
	"@radix-ui/react-switch": "1.2.6",
	"@tailwindcss/typography": "0.5.19",
	"@tanstack/react-query": "5.105.0",
	"@tanstack/query-core": "5.105.0",
	ai: "7.0.155",
	"class-variance-authority": "0.7.1",
	clsx: "2.1.1",
	cmdk: "1.1.1",
	"date-fns": "4.1.0",
	"highlight.js": "11.11.1",
	katex: "0.16.35",
	"lucide-react": "1.7.0",
	react: "19.3.1",
	"react-dom": "19.3.1",
	"react-error-boundary": "4.1.2",
	"react-hook-form": "7.66.1",
	"react-markdown": "9.1.0",
	"rehype-highlight": "7.0.2",
	"rehype-katex": "7.0.1",
	"rehype-raw": "7.0.0",
	"remark-gfm": "4.0.1",
	"remark-math": "6.0.0",
	sonner: "2.0.7",
	"tailwind-merge": "3.5.0",
	tailwindcss: "4.3.3",
	zod: "4.6.7",
});

const AUTH_DEPENDENCIES = Object.freeze({
	tailwindcss: "4.3.3",
	...pickVersions(AUTH_COHORT, [
		"@better-auth/api-key",
		"@better-auth/passkey",
	]),
	"@tanstack/react-query": "5.105.0",
	"@tanstack/query-core": "5.105.0",
});

const DEV_DEPENDENCIES = Object.freeze({
	"@types/node": "24.12.0",
	"@types/react": "19.3.0",
	"@types/react-dom": "19.3.0",
	typescript: "5.9.3",
	vite: "8.3.5",
});

export const FIXTURE_PACKAGES = {
	"route-docs": ["@btst/plugin-route-docs"],
	"open-api": ["@btst/plugin-open-api"],
	affiliate: ["@btst/plugin-affiliate"],
	core: [],
	"feature-flags": ["@btst/plugin-feature-flags"],

	feedback: ["@btst/plugin-feedback"],
	calendar: ["@btst/plugin-calendar"],
	analytics: ["@btst/plugin-analytics"],
	newsletter: ["@btst/plugin-newsletter"],
	"blog-newsletter": ["@btst/plugin-blog", "@btst/plugin-newsletter"],
	"job-board": [
		"@btst/plugin-job-board",
		"@btst/plugin-cms",
		"@btst/plugin-form-builder",
	],
	components: ["@btst/components"],
	auth: [],
	"ai-chat": ["@btst/plugin-ai-chat"],
	cms: ["@btst/plugin-cms"],
	blog: ["@btst/plugin-blog"],
	ecommerce: [
		"@btst/plugin-ecommerce",
		"@btst/plugin-cms",
		"@btst/plugin-media",
	],
	"ui-builder": ["@btst/plugin-cms", "@btst/plugin-ui-builder"],
	kanban: ["@btst/plugin-kanban"],
	crm: ["@btst/plugin-crm", "@btst/plugin-kanban"],
	school: ["@btst/plugin-school", "@btst/plugin-cms"],
	comments: ["@btst/plugin-comments"],
	"form-builder": ["@btst/plugin-form-builder"],
	media: ["@btst/plugin-media"],
	"media-s3": ["@btst/plugin-media"],
	"media-vercel-blob": ["@btst/plugin-media"],
};
const FIXTURE_SOURCES = {
	"media-s3": "media",
	"media-vercel-blob": "media",
};
const FIXTURES = new Set(Object.keys(FIXTURE_PACKAGES));
const FEATURE_PACKAGES = [
	...new Set(Object.values(FIXTURE_PACKAGES).flat()),
].filter((name) => name.startsWith("@btst/plugin-"));
const PACKAGE_MANAGERS = new Set(["npm", "pnpm"]);

function usage() {
	return [
		`Usage: node scripts/packed-consumer-smoke.mjs --fixture <${[...FIXTURES].join("|")}> --package-manager <npm|pnpm>`,
		"       [--better-auth-ui <tarball>] [--artifacts <directory>] [--sha <commit>]",
		"       [--report <file>] [--keep-temp]",
	].join("\n");
}

export function parseArgs(argv) {
	const options = {
		fixture: undefined,
		packageManager: undefined,
		betterAuthUi: undefined,
		artifacts: undefined,
		sha: undefined,
		report: undefined,
		keepTemp: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		switch (argument) {
			case "--":
				break;
			case "--fixture":
				options.fixture = argv[++index];
				break;
			case "--package-manager":
				options.packageManager = argv[++index];
				break;
			case "--better-auth-ui":
				options.betterAuthUi = argv[++index];
				break;
			case "--artifacts":
				options.artifacts = argv[++index];
				break;
			case "--sha":
				options.sha = argv[++index];
				break;
			case "--report":
				options.report = argv[++index];
				break;
			case "--keep-temp":
				options.keepTemp = true;
				break;
			case "--help":
			case "-h":
				throw new Error(usage());
			default:
				throw new Error(
					`Unknown argument: ${argument ?? "<missing>"}\n${usage()}`,
				);
		}
	}

	if (!FIXTURES.has(options.fixture)) {
		throw new Error(
			`--fixture must be ${[...FIXTURES].join(", ")}\n${usage()}`,
		);
	}
	if (!PACKAGE_MANAGERS.has(options.packageManager)) {
		throw new Error(`--package-manager must be npm or pnpm\n${usage()}`);
	}
	if (options.sha !== undefined && !/^[a-f\d]{40}$/.test(options.sha)) {
		throw new Error("--sha must be an exact Git commit");
	}
	if (options.fixture === "auth" && !options.betterAuthUi) {
		throw new Error(
			`The auth fixture requires --better-auth-ui <tarball>\n${usage()}`,
		);
	}

	return options;
}

function collectTreeProblems(value, path = [], problems = []) {
	if (!value || typeof value !== "object") return problems;

	if (Array.isArray(value.problems)) problems.push(...value.problems);
	if (value.invalid === true || value.missing === true) {
		const label =
			path.length > 0
				? `${path.at(-1)}@${value.version ?? "missing"}`
				: "dependency tree";
		problems.push(`${label} is ${value.missing ? "missing" : "invalid"}`);
	}
	for (const [name, dependency] of Object.entries(value.dependencies ?? {})) {
		collectTreeProblems(dependency, [...path, name], problems);
	}
	return problems;
}

export function assertHealthyDependencyTree(tree) {
	const problems = [...new Set(collectTreeProblems(tree))];
	if (problems.length > 0) {
		throw new Error(`Dependency tree is invalid:\n- ${problems.join("\n- ")}`);
	}
}

export function findMissingDirectPeers(packageManifest, consumerManifest) {
	const directDependencies = {
		...consumerManifest.dependencies,
		...consumerManifest.devDependencies,
	};
	return Object.entries(packageManifest.peerDependencies ?? {})
		.filter(
			([name]) =>
				packageManifest.peerDependenciesMeta?.[name]?.optional !== true,
		)
		.filter(([name]) => directDependencies[name] === undefined)
		.map(([name, range]) => `${name}@${range}`)
		.sort();
}

export function collectNamedVersions(tree, names) {
	const versions = Object.fromEntries(
		[...names].map((name) => [name, new Set()]),
	);

	function visit(value) {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		for (const [name, dependency] of Object.entries(value.dependencies ?? {})) {
			if (versions[name] && typeof dependency.version === "string") {
				versions[name].add(dependency.version);
			}
			visit(dependency);
		}
	}

	for (const root of Array.isArray(tree) ? tree : [tree]) visit(root);
	return Object.fromEntries(
		Object.entries(versions).map(([name, found]) => [name, [...found].sort()]),
	);
}

export function assertAuthCohort(
	versions,
	{ allowNestedVersions = true } = {},
) {
	const problems = [];
	for (const [name, expected] of Object.entries(AUTH_COHORT)) {
		const found = versions[name] ?? [];
		const acceptsDuplicates =
			allowNestedVersions && DUPLICATE_TOLERANT_AUTH_PACKAGES.has(name);
		if (
			!found.includes(expected) ||
			(!acceptsDuplicates && (found.length !== 1 || found[0] !== expected))
		) {
			problems.push(
				`${name}: expected ${acceptsDuplicates ? `${expected} to be present` : `only ${expected}`}; found ${found.join(", ") || "nothing"}`,
			);
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`Auth dependency cohort mismatch:\n- ${problems.join("\n- ")}`,
		);
	}
}

function assertNode22() {
	if (Number(process.versions.node.split(".")[0]) !== 22) {
		throw new Error(
			`Packed consumer smoke tests require Node.js 22; found ${process.version}`,
		);
	}
}

function logStep(message) {
	console.log(`\n[packed-consumer] ${message}`);
}

async function runCommand(command, args, options = {}) {
	const rendered = [command, ...args].join(" ");
	logStep(rendered);
	try {
		const result = await execFileAsync(command, args, {
			cwd: options.cwd,
			env: { ...process.env, CI: "true", ...options.env },
			maxBuffer: 50 * 1024 * 1024,
		});
		if (!options.quiet && result.stdout.trim())
			console.log(result.stdout.trim());
		if (!options.quiet && result.stderr.trim())
			console.error(result.stderr.trim());
		return result;
	} catch (error) {
		if (error.stdout?.trim()) console.error(error.stdout.trim());
		if (error.stderr?.trim()) console.error(error.stderr.trim());
		throw new Error(`Command failed: ${rendered}`, { cause: error });
	}
}

async function packPackages(tempRoot, options) {
	await validateSourceOwnership();
	const { fixture } = options;
	const packageNames =
		fixture === "components"
			? FIXTURE_PACKAGES[fixture]
			: ["@btst/stack", ...FIXTURE_PACKAGES[fixture]];
	const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
		cwd: REPOSITORY_ROOT,
	});
	const sha = options.sha ?? stdout.trim();
	if (options.artifacts) {
		const artifacts = {};
		for (const entry of await readdir(resolve(options.artifacts))) {
			if (!entry.endsWith(".tgz")) continue;
			const path = join(resolve(options.artifacts), entry);
			const artifact = await inspectCandidate(path);
			const { name, gitHead } = artifact;
			if (!packageNames.includes(name)) continue;
			assert(!artifacts[name], `More than one candidate archive for ${name}`);
			assert.equal(gitHead, sha, `${name} source identity differs`);
			artifacts[name] = artifact;
		}
		for (const name of packageNames)
			assert(artifacts[name], `Missing prepared archive for ${name}`);
		return { sha, artifacts };
	}
	for (const name of packageNames) {
		await rm(
			join(
				REPOSITORY_ROOT,
				"packages",
				name === "@btst/stack" ? "stack" : name.slice("@btst/".length),
				"dist",
			),
			{ recursive: true, force: true },
		);
	}
	await runCommand(
		"pnpm",
		[
			"exec",
			"turbo",
			"build",
			...packageNames.map((name) => `--filter=${name}`),
		],
		{
			cwd: REPOSITORY_ROOT,
			quiet: true,
		},
	);
	const artifactsDir = join(tempRoot, "artifacts");
	await mkdir(artifactsDir, { recursive: true });
	const artifacts = {};
	for (const packageName of packageNames) {
		artifacts[packageName] = await packCandidate({
			packageDir: join(
				REPOSITORY_ROOT,
				"packages",
				packageName === "@btst/stack"
					? "stack"
					: packageName.slice("@btst/".length),
			),
			destination: artifactsDir,
			expectedSha: sha,
		});
	}
	return { sha, artifacts };
}

async function normalizePackageSpec(spec) {
	if (!spec.endsWith(".tgz")) {
		throw new Error(
			`--better-auth-ui must reference a packed .tgz artifact; received ${spec}`,
		);
	}
	const path = isAbsolute(spec) ? spec : resolve(process.cwd(), spec);
	return realpath(path);
}

export function createConsumerManifest({
	fixture,
	stackTarball,
	betterAuthUi,
	betterDb,
	packageTarballs = {},
	packageManifests = {},
	fixtureDependencies = {},
}) {
	const candidates = { "@btst/stack": stackTarball, ...packageTarballs };
	const candidateDependencies = {};
	for (const [owner, manifest] of Object.entries(packageManifests)) {
		for (const kind of ["dependencies", "peerDependencies"]) {
			for (const [name, range] of Object.entries(manifest[kind] ?? {})) {
				if (
					name !== "@btst/stack" &&
					name !== "@btst/components" &&
					!name.startsWith("@btst/plugin-")
				)
					continue;
				if (!candidates[name]) {
					if (
						kind === "peerDependencies" &&
						manifest.peerDependenciesMeta?.[name]?.optional
					)
						continue;
					throw new Error(`${owner} requires a packed candidate for ${name}`);
				}
				const version = packageManifests[name]?.version;
				assert(
					version && satisfies(version, range),
					`${owner} requires ${name}@${range}, incompatible with candidate ${version}`,
				);
				if (kind === "dependencies")
					candidateDependencies[name] = candidates[name];
			}
		}
	}
	const peerNames = new Set();
	for (const manifest of Object.values(packageManifests)) {
		for (const name of Object.keys(manifest.peerDependencies ?? {})) {
			if (manifest.peerDependenciesMeta?.[name]?.optional) continue;
			if (name.startsWith("@btst/plugin-") || name === "@btst/stack") continue;
			peerNames.add(name);
		}
	}
	if (Object.keys(packageManifests).length === 0) {
		for (const name of fixture === "components"
			? ["react", "react-dom", "react-hook-form", "tailwindcss", "zod"]
			: [
					"@btst/yar",
					"@tanstack/react-query",
					"react",
					"react-dom",
					"react-error-boundary",
					"sonner",
					"zod",
				]) {
			peerNames.add(name);
		}
	}
	const versions = { ...AUTH_COHORT, ...TESTED_DEPENDENCY_VERSIONS };
	const peers = Object.fromEntries(
		[...peerNames].map((name) => {
			assert(
				versions[name],
				`No tested version recorded for required peer ${name}`,
			);
			return [name, versions[name]];
		}),
	);
	const infrastructure =
		fixture === "components"
			? {}
			: {
					...pickVersions(AUTH_COHORT, [
						"@better-auth/core",
						"@better-auth/utils",
						"@better-fetch/fetch",
						"@btst/db",
						"better-auth",
						"better-call",
					]),
					"@tanstack/query-core":
						TESTED_DEPENDENCY_VERSIONS["@tanstack/query-core"],
				};
	const substitutions = {
		...candidateDependencies,
		...(betterDb ? { "@btst/db": betterDb } : {}),
	};
	return {
		name: `btst-packed-${fixture}-consumer`,
		private: true,
		version: "0.0.0",
		type: "module",
		packageManager: "pnpm@10.17.1",
		scripts: {
			typecheck: "tsc --noEmit",
			build: "vite build --manifest",
		},
		dependencies: {
			...infrastructure,
			...peers,
			...fixtureDependencies,
			...(fixture === "auth" ? AUTH_DEPENDENCIES : {}),
			...(fixture === "components" ? {} : { "@btst/stack": stackTarball }),
			...packageTarballs,
			...([
				"core",
				"ai-chat",
				"newsletter",
				"blog-newsletter",
				"cms",
				"blog",
				"kanban",
				"form-builder",
				"job-board",
				"crm",
				"school",
				"affiliate",
				"feedback",
				"calendar",

				"comments",
				"analytics",
				"feature-flags",

				"open-api",
				"ui-builder",
				"ecommerce",
			].includes(fixture) || fixture.startsWith("media")
				? { "@btst/adapter-memory": "3.0.1" }
				: {}),
			...(fixture === "media-s3"
				? {
						"@aws-sdk/client-s3": "3.1011.0",
						"@aws-sdk/s3-request-presigner": "3.1011.0",
					}
				: {}),
			...(fixture === "media-vercel-blob" ? { "@vercel/blob": "2.8.2" } : {}),
			...(betterDb ? { "@btst/db": betterDb } : {}),
			...(fixture === "auth" ? { "@btst/better-auth-ui": betterAuthUi } : {}),
		},
		devDependencies: DEV_DEPENDENCIES,
		...(Object.keys(substitutions).length
			? {
					overrides: Object.fromEntries(
						Object.keys(substitutions).map((name) => [name, `$${name}`]),
					),
					pnpm: { overrides: substitutions },
				}
			: {}),
	};
}

async function writeConsumer(tempRoot, options, packageTarballs) {
	const packageManifests = {};
	for (const [name, tarball] of Object.entries(packageTarballs)) {
		const { stdout } = await execFileAsync("tar", [
			"-xOf",
			tarball,
			"package/package.json",
		]);
		packageManifests[name] = JSON.parse(stdout);
	}
	const consumerDir = join(
		tempRoot,
		`${options.fixture}-${options.packageManager}`,
	);
	await mkdir(consumerDir, { recursive: true });
	await cp(join(FIXTURES_DIR, "shared"), consumerDir, { recursive: true });
	if (FIXTURE_SOURCES[options.fixture]) {
		await cp(
			join(FIXTURES_DIR, FIXTURE_SOURCES[options.fixture]),
			consumerDir,
			{
				recursive: true,
			},
		);
	}
	await cp(join(FIXTURES_DIR, options.fixture), consumerDir, {
		recursive: true,
	});
	const fixtureDependencies = {};
	async function collectImports(directory) {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await collectImports(path);
				continue;
			}
			if (!/\.(?:[cm]?js|[cm]?ts|tsx)$/.test(entry.name)) continue;
			for (const { fileName } of ts.preProcessFile(
				await readFile(path, "utf8"),
				true,
				true,
			).importedFiles) {
				if (fileName.startsWith(".") || isBuiltin(fileName)) continue;
				const name = fileName.startsWith("@")
					? fileName.split("/").slice(0, 2).join("/")
					: fileName.split("/")[0];
				if (
					name === "@btst/stack" ||
					name === "@btst/components" ||
					name === "@btst/better-auth-ui" ||
					name.startsWith("@btst/plugin-") ||
					DEV_DEPENDENCIES[name]
				)
					continue;
				const version = TESTED_DEPENDENCY_VERSIONS[name] ?? AUTH_COHORT[name];
				assert(version, `No tested fixture dependency version for ${name}`);
				fixtureDependencies[name] = version;
			}
		}
	}
	await collectImports(consumerDir);
	const betterAuthUi =
		options.fixture === "auth"
			? await normalizePackageSpec(options.betterAuthUi)
			: undefined;
	if (betterAuthUi) {
		const { stdout } = await execFileAsync("tar", [
			"-xOf",
			betterAuthUi,
			"package/package.json",
		]);
		const companion = JSON.parse(stdout);
		assert.equal(companion.name, "@btst/better-auth-ui");
		assert.match(
			companion.gitHead ?? "",
			/^[a-f\d]{40}$/,
			"Companion artifact must record its source commit",
		);
		packageManifests[companion.name] = companion;
	}
	const manifest = createConsumerManifest({
		fixture: options.fixture,
		stackTarball: packageTarballs["@btst/stack"],
		packageTarballs,
		packageManifests,
		fixtureDependencies,
		betterDb: process.env.BTST_DB_TARBALL
			? await realpath(process.env.BTST_DB_TARBALL)
			: undefined,
		betterAuthUi,
	});
	await writeFile(
		join(consumerDir, "package.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	return { consumerDir, manifest };
}

async function browserCosts(consumerDir) {
	const dist = join(consumerDir, "dist");
	const manifest = JSON.parse(
		await readFile(join(dist, ".vite/manifest.json"), "utf8"),
	);
	const entries = {};
	for (const [key, entry] of Object.entries(manifest)) {
		if (!entry.isEntry) continue;
		const initial = new Set();
		const deferred = new Set();
		const visited = new Set();
		const dynamic = [];
		function walk(name, assets) {
			const visit = `${assets === initial ? "initial" : "deferred"}:${name}`;
			if (visited.has(visit)) return;
			visited.add(visit);
			const chunk = manifest[name];
			assert(chunk, `Missing production manifest chunk ${name}`);
			for (const file of [
				chunk.file,
				...(chunk.css ?? []),
				...(chunk.assets ?? []),
			])
				assets.add(file);
			for (const dependency of chunk.imports ?? []) walk(dependency, assets);
			dynamic.push(...(chunk.dynamicImports ?? []));
		}
		walk(key, initial);
		for (let index = 0; index < dynamic.length; index++)
			walk(dynamic[index], deferred);
		for (const file of initial) deferred.delete(file);
		async function measure(files) {
			let bytes = 0,
				gzipBytes = 0;
			for (const file of files) {
				const content = await readFile(join(dist, file));
				bytes += content.byteLength;
				gzipBytes += gzipSync(content).byteLength;
			}
			return { files: [...files].sort(), bytes, gzipBytes };
		}
		entries[key] = {
			initial: await measure(initial),
			deferred: await measure(deferred),
		};
	}
	return entries;
}

function installCommand(packageManager) {
	return packageManager === "npm"
		? ["npm", ["install", "--strict-peer-deps", "--no-audit", "--no-fund"]]
		: [
				"pnpm",
				["install", "--strict-peer-dependencies", "--frozen-lockfile=false"],
			];
}

function treeCommand(packageManager, depth = "Infinity", packageNames = []) {
	return packageManager === "npm"
		? ["npm", ["ls", ...packageNames, "--all", "--json", `--depth=${depth}`]]
		: ["pnpm", ["list", ...packageNames, "--json", "--depth", depth]];
}

async function readTree(
	packageManager,
	consumerDir,
	depth = "Infinity",
	packageNames = [],
) {
	const [command, args] = treeCommand(packageManager, depth, packageNames);
	const file = join(consumerDir, ".btst-dependency-tree.json");
	const output = await open(file, "w");
	logStep([command, ...args].join(" "));
	try {
		await new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: consumerDir,
				env: { ...process.env, CI: "true" },
				stdio: ["ignore", output.fd, "inherit"],
			});
			child.once("error", reject);
			child.once("close", (code) =>
				code === 0
					? resolve()
					: reject(new Error(`Dependency tree command exited with ${code}`)),
			);
		});
		return JSON.parse(await readFile(file, "utf8"));
	} finally {
		await output.close();
		await rm(file, { force: true });
	}
}

async function logFailureTrees(packageManager, consumerDir) {
	console.error("\n[packed-consumer] dependency diagnostics after failure");
	try {
		const [command, args] = treeCommand(packageManager, "Infinity", [
			"@btst/stack",
			"@btst/db",
			...Object.keys(AUTH_COHORT),
		]);
		await runCommand(command, args, { cwd: consumerDir });
	} catch (error) {
		console.error(error.message);
	}
}

async function validateDirectPeers(consumerDir, consumerManifest, fixture) {
	const packageNames = [
		...(fixture === "components" ? [] : ["@btst/stack", "@btst/db"]),
		...FIXTURE_PACKAGES[fixture],
		...(fixture === "auth" ? ["@btst/better-auth-ui"] : []),
	];
	for (const packageName of packageNames) {
		const packageManifest = JSON.parse(
			await readFile(
				join(
					consumerDir,
					"node_modules",
					...packageName.split("/"),
					"package.json",
				),
				"utf8",
			),
		);
		const missing = findMissingDirectPeers(packageManifest, consumerManifest);
		if (missing.length > 0) {
			throw new Error(
				`${packageName} has required peers that are not direct consumer dependencies:\n- ${missing.join("\n- ")}`,
			);
		}
	}
}

async function validateSourceOwnership() {
	const ui = join(REPOSITORY_ROOT, "packages/ui/src");
	for (const name of ["@btst/stack", "@btst/components", ...FEATURE_PACKAGES]) {
		const root = join(
			REPOSITORY_ROOT,
			"packages",
			name === "@btst/stack" ? "stack" : name.slice("@btst/".length),
			"src",
		);
		async function visit(directory) {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const path = join(directory, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== "__tests__") await visit(path);
					continue;
				}
				if (!/\.tsx?$/.test(entry.name)) continue;
				const source = await readFile(path, "utf8");
				for (const { fileName } of ts.preProcessFile(source, true, true)
					.importedFiles) {
					if (fileName.startsWith("@workspace/"))
						assert(
							name !== "@btst/stack" && fileName.startsWith("@workspace/ui/"),
							`${name} imports private runtime ${fileName}`,
						);
					if (!fileName.startsWith(".")) continue;
					const target = resolve(dirname(path), fileName);
					const own = !relative(root, target).startsWith("..");
					const privateUi =
						name !== "@btst/stack" && !relative(ui, target).startsWith("..");
					assert(
						own || privateUi,
						`${name} inlines another owner's source through ${relative(REPOSITORY_ROOT, path)} -> ${fileName}`,
					);
				}
			}
		}
		await visit(root);
	}
}

async function validatePublicImports(consumerDir, names) {
	const migration = JSON.parse(
		await readFile(join(SCRIPT_DIR, "v5-import-mapping.json"), "utf8"),
	);
	const baseline = migration.baseline.exports.map((key) =>
		key === "." ? "@btst/stack" : `@btst/stack/${key.slice(2)}`,
	);
	assert.deepEqual(
		migration.mappings.map(({ old }) => old).sort(),
		baseline.sort(),
		"Every v5 public entry needs exactly one migration",
	);
	const require = createRequire(join(consumerDir, "package.json"));
	const resolved = [];
	const esm = [];
	for (const name of names) {
		const root = join(consumerDir, "node_modules", name);
		const manifest = JSON.parse(
			await readFile(join(root, "package.json"), "utf8"),
		);
		async function targets(value) {
			if (typeof value === "string") {
				if (!value.includes("*"))
					assert(
						existsSync(resolve(root, value)),
						`${name} is missing exported file ${value}`,
					);
			} else for (const target of Object.values(value)) await targets(target);
		}
		for (const entry of Object.values(manifest.exports)) await targets(entry);
		for (const mapping of migration.mappings) {
			if (mapping.new.split("/").slice(0, 2).join("/") !== name) continue;
			if (mapping.new.includes("*")) {
				assert.equal(manifest.exports["./dist/*"], "./dist/*");
				require.resolve("@btst/stack/dist/api/index.cjs");
				esm.push("@btst/stack/dist/api/index.mjs");
			} else {
				require.resolve(mapping.new);
				esm.push(mapping.new);
			}
			resolved.push(mapping.old);
		}
	}
	if (names.includes("@btst/stack")) {
		for (const mapping of migration.mappings) {
			if (mapping.old !== mapping.new)
				assert.throws(
					() => require.resolve(mapping.old),
					`Removed Core facade still resolves: ${mapping.old}`,
				);
		}
	}
	await runCommand(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
for (const name of JSON.parse(process.argv[1])) assert(existsSync(fileURLToPath(import.meta.resolve(name))), name);
`,
			JSON.stringify(esm),
		],
		{ cwd: consumerDir, quiet: true },
	);
	return resolved;
}

export async function validatePackageOwnership(consumerDir, packageNames) {
	for (const name of packageNames) {
		const root = join(consumerDir, "node_modules", name);
		const manifest = JSON.parse(
			await readFile(join(root, "package.json"), "utf8"),
		);
		const dependencies = {
			...manifest.dependencies,
			...manifest.peerDependencies,
		};
		for (const range of Object.values(dependencies)) {
			assert.doesNotMatch(
				range,
				/^workspace:/,
				`${name} ships an unresolved workspace dependency`,
			);
		}
		async function visit(directory) {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const path = join(directory, entry.name);
				const parts = relative(join(root, "dist"), path).split(/[\\/]/);
				if (name === "@btst/stack") {
					assert(
						!["components", "packages"].includes(parts[0]),
						`Core contains removed standalone implementation ${parts.join("/")}`,
					);
					assert(
						!(
							parts[0] === "plugins" &&
							FEATURE_PACKAGES.some(
								(owner) => owner.slice("@btst/plugin-".length) === parts[1],
							)
						),
						`Core contains extracted feature implementation ${parts.join("/")}`,
					);
				}
				if (entry.isDirectory()) {
					await visit(path);
					continue;
				}
				if (!/\.(?:mjs|cjs|ts|cts|mts|css)$/.test(entry.name)) continue;
				assert(
					!relative(join(root, "dist"), path)
						.split(/[\\/]/)
						.includes("node_modules"),
					`${name} inlines a third-party implementation in dist`,
				);
				const content = await readFile(path, "utf8");
				if (/\.(?:mjs|cjs)$/.test(entry.name)) {
					const ownSource = join(
						REPOSITORY_ROOT,
						"packages",
						name === "@btst/stack" ? "stack" : name.slice("@btst/".length),
						"src",
					);
					const sourceBase =
						parts[0] === "_private" && parts[1] === "ui"
							? join(
									REPOSITORY_ROOT,
									"packages/ui/src",
									...parts.slice(2),
								).replace(/\.(?:mjs|cjs)$/, "")
							: parts[0] === "ui" && parts[1] === "src"
								? join(
										REPOSITORY_ROOT,
										"packages/ui/src",
										...parts.slice(2),
									).replace(/\.(?:mjs|cjs)$/, "")
								: join(ownSource, ...parts).replace(/\.(?:mjs|cjs)$/, "");
					const sourceFile = [".ts", ".tsx"]
						.map((extension) => sourceBase + extension)
						.find(existsSync);
					if (
						sourceFile &&
						/^\s*["']use client["'];/.test(await readFile(sourceFile, "utf8"))
					)
						assert.match(
							content,
							/^["']use client["'];/m,
							`${name} lost a client directive in ${parts.join("/")}`,
						);
				}
				assert.doesNotMatch(
					content,
					/@workspace\//,
					`${name} ships unresolved private imports`,
				);
				assert.doesNotMatch(
					content,
					/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](?:\/|[A-Za-z]:[\\/])/,
					`${name} ships an absolute import path`,
				);
				if (entry.name.endsWith(".css")) continue;
				for (const { fileName: specifier } of ts.preProcessFile(
					content,
					true,
					true,
				).importedFiles) {
					if (specifier.startsWith(".") || isBuiltin(specifier)) continue;
					const dependency = specifier.startsWith("@")
						? specifier.split("/").slice(0, 2).join("/")
						: specifier.split("/")[0];
					assert.ok(
						dependency === manifest.name || dependencies[dependency],
						`${name} does not declare shipped dependency ${dependency}`,
					);
				}
			}
		}
		await visit(join(root, "dist"));
	}
}

async function validateConsumer(options, consumerDir, manifest) {
	const [install, installArgs] = installCommand(options.packageManager);
	try {
		await runCommand(install, installArgs, { cwd: consumerDir });
		const directTree = await readTree(options.packageManager, consumerDir, "0");
		for (const root of Array.isArray(directTree) ? directTree : [directTree]) {
			assertHealthyDependencyTree(root);
		}
		await validateDirectPeers(consumerDir, manifest, options.fixture);
		const owners = [
			...(options.fixture === "components" ? [] : ["@btst/stack"]),
			...FIXTURE_PACKAGES[options.fixture],
		];
		await validatePackageOwnership(consumerDir, owners);
		const migratedImports = await validatePublicImports(consumerDir, owners);
		const featureTree = await readTree(
			options.packageManager,
			consumerDir,
			"Infinity",
		);
		for (const root of Array.isArray(featureTree) ? featureTree : [featureTree])
			assertHealthyDependencyTree(root);
		const installed = collectNamedVersions(featureTree, FEATURE_PACKAGES);
		for (const [name, versions] of Object.entries(installed)) {
			if (versions.length === 0) continue;
			assert(
				FIXTURE_PACKAGES[options.fixture].includes(name),
				`Unselected feature installed: ${name}`,
			);
		}

		const compatibilityPackages =
			options.fixture === "components"
				? ["react", "react-dom", "react-hook-form", "zod"]
				: [
						"@btst/stack",
						...(options.fixture === "auth" ? ["@btst/better-auth-ui"] : []),
						...Object.keys(AUTH_COHORT),
					];
		const compatibilityTree = await readTree(
			options.packageManager,
			consumerDir,
			"Infinity",
			[...new Set(compatibilityPackages)],
		);
		for (const root of Array.isArray(compatibilityTree)
			? compatibilityTree
			: [compatibilityTree]) {
			assertHealthyDependencyTree(root);
		}
		if (options.fixture === "auth") {
			assertAuthCohort(
				collectNamedVersions(directTree, Object.keys(AUTH_COHORT)),
				{ allowNestedVersions: false },
			);
			const versions = collectNamedVersions(
				[directTree, compatibilityTree],
				Object.keys(AUTH_COHORT),
			);
			console.log(
				`\n[packed-consumer] resolved auth cohort\n${JSON.stringify(versions, null, 2)}`,
			);
			assertAuthCohort(versions);
		}

		await runCommand(options.packageManager, ["run", "typecheck"], {
			cwd: consumerDir,
		});
		await runCommand(options.packageManager, ["run", "build"], {
			cwd: consumerDir,
		});
		const browser = await browserCosts(consumerDir);
		if (existsSync(join(consumerDir, "src/public-api.cts"))) {
			await runCommand(
				"node",
				[
					"node_modules/typescript/bin/tsc",
					"--noEmit",
					"--skipLibCheck",
					"--module",
					"node16",
					"--moduleResolution",
					"node16",
					"--target",
					"es2022",
					"src/public-api.cts",
				],
				{ cwd: consumerDir },
			);
		}
		if (existsSync(join(consumerDir, "runtime.mjs"))) {
			await runCommand("node", ["runtime.mjs"], { cwd: consumerDir });
		}
		if (existsSync(join(consumerDir, "browser.mjs"))) {
			await validateBrowser(consumerDir);
		}
		return { browser, migratedImports };
	} catch (error) {
		await logFailureTrees(options.packageManager, consumerDir);
		throw error;
	}
}

async function validateBrowser(consumerDir) {
	const dist = join(consumerDir, "dist");
	const server = createServer(async (request, response) => {
		const path = resolve(
			dist,
			`.${new URL(request.url, "http://localhost").pathname}`,
		);
		if (relative(dist, path).startsWith("..")) {
			response.writeHead(403).end();
			return;
		}
		try {
			const file = path === dist ? join(dist, "index.html") : path;
			const type = file.endsWith(".js")
				? "text/javascript"
				: file.endsWith(".css")
					? "text/css"
					: "text/html";
			const content = await readFile(file);
			response.writeHead(200, { "content-type": type }).end(content);
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { chromium } = createRequire(join(REPOSITORY_ROOT, "e2e/package.json"))(
		"@playwright/test",
	);
	let browser;
	try {
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}`);
		const { default: verifyBrowser } = await import(
			pathToFileURL(join(consumerDir, "browser.mjs")).href
		);
		await verifyBrowser({ page, consumerDir });
		assert.deepEqual(errors, []);
	} finally {
		await browser?.close();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
	logStep("packed browser behavior passed");
}

export async function runPackedConsumerSmoke(options) {
	assertNode22();
	const tempRoot = await mkdtemp(join(tmpdir(), "btst-packed-consumer-"));
	try {
		logStep(`temporary workspace: ${tempRoot}`);
		const { sha, artifacts } = await packPackages(tempRoot, options);
		const packageTarballs = Object.fromEntries(
			Object.entries(artifacts).map(([name, artifact]) => [
				name,
				artifact.path,
			]),
		);
		const { consumerDir, manifest } = await writeConsumer(
			tempRoot,
			options,
			packageTarballs,
		);
		const { browser, migratedImports } = await validateConsumer(
			options,
			consumerDir,
			manifest,
		);
		const receipt = {
			fixture: options.fixture,
			packageManager: options.packageManager,
			source: sha,
			artifacts: Object.fromEntries(
				Object.entries(artifacts).map(
					([name, { path: _path, manifest: _manifest, ...artifact }]) => [
						name,
						artifact,
					],
				),
			),
			coreCompatibility: artifacts["@btst/stack"]
				? {
						minimum: artifacts["@btst/stack"].version,
						latest: artifacts["@btst/stack"].version,
						tested: artifacts["@btst/stack"].version,
					}
				: undefined,
			browser,
			migratedImports,
		};
		if (options.report) {
			await mkdir(dirname(resolve(options.report)), { recursive: true });
			await writeFile(
				resolve(options.report),
				`${JSON.stringify(receipt, null, 2)}\n`,
			);
		}
		logStep(`${options.fixture} fixture passed with ${options.packageManager}`);
		return receipt;
	} finally {
		if (options.keepTemp) {
			console.log(`\n[packed-consumer] kept temporary workspace: ${tempRoot}`);
		} else {
			await rm(tempRoot, { recursive: true, force: true });
		}
	}
}
