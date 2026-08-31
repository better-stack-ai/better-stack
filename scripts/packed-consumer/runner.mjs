import { execFile } from "node:child_process";
import {
	cp,
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "../..");
const FIXTURES_DIR = join(SCRIPT_DIR, "fixtures");

export const AUTH_COHORT = Object.freeze({
	"@better-auth/core": "1.6.16",
	"@better-auth/utils": "0.4.1",
	"@better-fetch/fetch": "1.2.2",
	"@btst/db": "2.2.3",
	"better-auth": "1.6.16",
	"better-call": "1.3.6",
});

const CORE_DEPENDENCIES = Object.freeze({
	"@ai-sdk/react": "2.0.94",
	"@better-auth/core": "1.6.16",
	"@better-auth/utils": "0.4.1",
	"@better-fetch/fetch": "1.2.2",
	"@btst/yar": "1.3.2",
	"@hookform/resolvers": "5.2.2",
	"@radix-ui/react-dialog": "1.1.15",
	"@radix-ui/react-label": "2.1.8",
	"@radix-ui/react-slot": "1.2.4",
	"@radix-ui/react-switch": "1.2.6",
	"@tailwindcss/typography": "0.5.19",
	"@tanstack/react-query": "5.90.10",
	ai: "5.0.94",
	"better-auth": "1.6.16",
	"better-call": "1.3.6",
	"class-variance-authority": "0.7.1",
	clsx: "2.1.1",
	cmdk: "1.1.1",
	"date-fns": "4.1.0",
	"highlight.js": "11.11.1",
	katex: "0.16.35",
	"lucide-react": "1.7.0",
	react: "19.2.7",
	"react-dom": "19.2.7",
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
	tailwindcss: "4.2.2",
	zod: "4.4.3",
});

const AUTH_DEPENDENCIES = Object.freeze({
	"@better-auth/api-key": "1.6.16",
	"@better-auth/passkey": "1.6.16",
	"@better-fetch/fetch": "1.2.2",
	"@captchafox/react": "1.10.0",
	"@hookform/resolvers": "5.2.2",
	"@marsidev/react-turnstile": "1.1.0",
	"@radix-ui/react-avatar": "1.1.9",
	"@radix-ui/react-checkbox": "1.3.3",
	"@radix-ui/react-context": "1.1.3",
	"@radix-ui/react-dialog": "1.1.15",
	"@radix-ui/react-dropdown-menu": "2.1.14",
	"@radix-ui/react-label": "2.1.8",
	"@radix-ui/react-primitive": "2.1.4",
	"@radix-ui/react-select": "2.2.4",
	"@radix-ui/react-separator": "1.1.8",
	"@radix-ui/react-slot": "1.2.4",
	"@radix-ui/react-tabs": "1.1.13",
	"@radix-ui/react-tooltip": "1.2.8",
	"@radix-ui/react-use-callback-ref": "1.1.1",
	"@radix-ui/react-use-layout-effect": "1.1.1",
	"@tanstack/react-query": "5.101.0",
	"better-auth": "1.6.16",
	"class-variance-authority": "0.7.1",
	clsx: "2.1.1",
	"input-otp": "1.4.2",
	"lucide-react": "1.7.0",
	"react-hook-form": "7.66.1",
	sonner: "2.0.7",
	"tailwind-merge": "3.5.0",
	tailwindcss: "4.2.2",
	zod: "4.4.3",
});

const DEV_DEPENDENCIES = Object.freeze({
	"@types/node": "24.12.0",
	"@types/react": "19.2.14",
	"@types/react-dom": "19.2.3",
	typescript: "5.9.3",
	vite: "7.3.1",
});

const FIXTURES = new Set(["core", "auth"]);
const PACKAGE_MANAGERS = new Set(["npm", "pnpm"]);

function usage() {
	return [
		"Usage: node scripts/packed-consumer-smoke.mjs --fixture <core|auth> --package-manager <npm|pnpm>",
		"       [--better-auth-ui <tarball-or-package-spec>] [--keep-temp]",
	].join("\n");
}

export function parseArgs(argv) {
	const options = {
		fixture: undefined,
		packageManager: undefined,
		betterAuthUi: undefined,
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
		throw new Error(`--fixture must be core or auth\n${usage()}`);
	}
	if (!PACKAGE_MANAGERS.has(options.packageManager)) {
		throw new Error(`--package-manager must be npm or pnpm\n${usage()}`);
	}
	if (options.fixture === "auth" && !options.betterAuthUi) {
		throw new Error(
			`The auth fixture requires --better-auth-ui <tarball-or-package-spec>\n${usage()}`,
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

export function assertAuthCohort(versions) {
	const problems = [];
	for (const [name, expected] of Object.entries(AUTH_COHORT)) {
		const found = versions[name] ?? [];
		if (found.length !== 1 || found[0] !== expected) {
			problems.push(
				`${name}: expected only ${expected}; found ${found.join(", ") || "nothing"}`,
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

async function packStack(tempRoot) {
	await runCommand("pnpm", ["--filter", "@btst/stack", "build"], {
		cwd: REPOSITORY_ROOT,
		quiet: true,
	});
	const artifactsDir = join(tempRoot, "artifacts");
	await mkdir(artifactsDir, { recursive: true });
	const result = await runCommand(
		"npm",
		["pack", "--quiet", "--pack-destination", artifactsDir],
		{ cwd: join(REPOSITORY_ROOT, "packages/stack") },
	);
	const tarballName = result.stdout.trim().split(/\s+/).at(-1);
	if (!tarballName?.endsWith(".tgz")) {
		throw new Error(`npm pack did not report a tarball: ${result.stdout}`);
	}
	return join(artifactsDir, basename(tarballName));
}

async function normalizePackageSpec(spec) {
	if (!spec.endsWith(".tgz")) return spec;
	const path = isAbsolute(spec) ? spec : resolve(process.cwd(), spec);
	return realpath(path);
}

export function createConsumerManifest({
	fixture,
	stackTarball,
	betterAuthUi,
}) {
	return {
		name: `btst-packed-${fixture}-consumer`,
		private: true,
		version: "0.0.0",
		type: "module",
		packageManager: "pnpm@10.17.1",
		scripts: {
			typecheck: "tsc --noEmit",
			build: "vite build",
		},
		dependencies: {
			...CORE_DEPENDENCIES,
			...(fixture === "auth" ? AUTH_DEPENDENCIES : {}),
			"@btst/stack": stackTarball,
			...(fixture === "auth" ? { "@btst/better-auth-ui": betterAuthUi } : {}),
		},
		devDependencies: DEV_DEPENDENCIES,
	};
}

async function writeConsumer(tempRoot, options, stackTarball) {
	const consumerDir = join(
		tempRoot,
		`${options.fixture}-${options.packageManager}`,
	);
	await mkdir(consumerDir, { recursive: true });
	await cp(join(FIXTURES_DIR, "shared"), consumerDir, { recursive: true });
	await cp(join(FIXTURES_DIR, options.fixture), consumerDir, {
		recursive: true,
	});
	const manifest = createConsumerManifest({
		fixture: options.fixture,
		stackTarball,
		betterAuthUi:
			options.fixture === "auth"
				? await normalizePackageSpec(options.betterAuthUi)
				: undefined,
	});
	await writeFile(
		join(consumerDir, "package.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	return { consumerDir, manifest };
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
	const result = await runCommand(command, args, {
		cwd: consumerDir,
		quiet: depth === "Infinity",
	});
	return JSON.parse(result.stdout);
}

async function logFailureTrees(packageManager, consumerDir) {
	console.error("\n[packed-consumer] dependency diagnostics after failure");
	for (const manager of [packageManager]) {
		try {
			const [command, args] = treeCommand(manager, "Infinity", [
				"@btst/stack",
				"@btst/db",
				...Object.keys(AUTH_COHORT),
			]);
			await runCommand(command, args, { cwd: consumerDir });
		} catch (error) {
			console.error(error.message);
		}
	}
}

async function validateDirectPeers(consumerDir, consumerManifest, fixture) {
	const packageNames = [
		"@btst/stack",
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

async function validateConsumer(options, consumerDir, manifest) {
	const [install, installArgs] = installCommand(options.packageManager);
	try {
		await runCommand(install, installArgs, { cwd: consumerDir });
		const directTree = await readTree(options.packageManager, consumerDir, "0");
		for (const root of Array.isArray(directTree) ? directTree : [directTree]) {
			assertHealthyDependencyTree(root);
		}
		await validateDirectPeers(consumerDir, manifest, options.fixture);

		const compatibilityPackages = [
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
		const versions = collectNamedVersions(
			compatibilityTree,
			Object.keys(AUTH_COHORT),
		);
		if (options.fixture === "auth") {
			console.log(
				`\n[packed-consumer] resolved auth cohort\n${JSON.stringify(versions, null, 2)}`,
			);
		}
		assertAuthCohort(versions);

		await runCommand(options.packageManager, ["run", "typecheck"], {
			cwd: consumerDir,
		});
		await runCommand(options.packageManager, ["run", "build"], {
			cwd: consumerDir,
		});
	} catch (error) {
		await logFailureTrees(options.packageManager, consumerDir);
		throw error;
	}
}

export async function runPackedConsumerSmoke(options) {
	assertNode22();
	const tempRoot = await mkdtemp(join(tmpdir(), "btst-packed-consumer-"));
	try {
		logStep(`temporary workspace: ${tempRoot}`);
		const stackTarball = await packStack(tempRoot);
		const { consumerDir, manifest } = await writeConsumer(
			tempRoot,
			options,
			stackTarball,
		);
		await validateConsumer(options, consumerDir, manifest);
		logStep(`${options.fixture} fixture passed with ${options.packageManager}`);
	} finally {
		if (options.keepTemp) {
			console.log(`\n[packed-consumer] kept temporary workspace: ${tempRoot}`);
		} else {
			await rm(tempRoot, { recursive: true, force: true });
		}
	}
}
