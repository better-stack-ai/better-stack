#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const REPOSITORY_ROOT = resolve(CLI_DIRECTORY, "../..");
const SHADCN_VERSION = "4.0.5";
const BETTER_AUTH_UI_VERSION = "2.0.0";
const FRAMEWORKS = ["nextjs", "react-router", "tanstack"];

const AUTH_COHORT = Object.freeze({
	"@better-auth/api-key": "1.6.16",
	"@better-auth/core": "1.6.16",
	"@better-auth/passkey": "1.6.16",
	"@better-auth/utils": "0.4.1",
	"@better-fetch/fetch": "1.2.2",
	"@btst/db": "2.2.3",
	"better-auth": "1.6.16",
	"better-call": "1.3.6",
});

const FIXTURE_CONFIG = Object.freeze({
	nextjs: {
		template: "next",
		cssFile: "app/globals.css",
		authClientPath: "lib/auth-client.ts",
		stackClientPath: "lib/stack-client.tsx",
		providerPath: "app/pages/client-layout.tsx",
		refresh: "frameworkRouter.refresh()",
		env: {
			BASE_URL: "http://localhost:3000",
			NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
			NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
		},
	},
	"react-router": {
		template: "react-router",
		cssFile: "app/app.css",
		authClientPath: "app/lib/auth-client.ts",
		stackClientPath: "app/lib/stack-client.tsx",
		providerPath: "app/routes/pages/_layout.tsx",
		refresh: "revalidator.revalidate()",
		env: {
			BASE_URL: "http://localhost:5173",
			VITE_BASE_URL: "http://localhost:5173",
			VITE_PUBLIC_SITE_URL: "http://localhost:5173",
		},
	},
	tanstack: {
		template: "start",
		cssFile: "src/styles.css",
		authClientPath: "src/lib/auth-client.ts",
		stackClientPath: "src/lib/stack-client.tsx",
		providerPath: "src/routes/pages/route.tsx",
		refresh: "frameworkRouter.invalidate()",
		env: {
			BASE_URL: "http://localhost:3000",
			VITE_BASE_URL: "http://localhost:3000",
			VITE_PUBLIC_SITE_URL: "http://localhost:3000",
		},
	},
});

function assertNode22() {
	if (Number(process.versions.node.split(".")[0]) !== 22) {
		throw new Error(
			`Better Auth UI fixtures require Node.js 22; found ${process.version}`,
		);
	}
}

function selectedFrameworks() {
	const requested = process.argv
		.slice(2)
		.filter((argument) => argument !== "--");
	if (requested.length === 0) return FRAMEWORKS;
	for (const framework of requested) {
		if (!FRAMEWORKS.includes(framework)) {
			throw new Error(
				`Unknown framework ${framework}. Expected: ${FRAMEWORKS.join(", ")}`,
			);
		}
	}
	return [...new Set(requested)];
}

function logStep(message) {
	console.log(`\n[better-auth-ui-fixture] ${message}`);
}

async function run(command, args, options = {}) {
	logStep([command, ...args].join(" "));
	try {
		return await execFileAsync(command, args, {
			cwd: options.cwd,
			env: {
				...process.env,
				CI: "true",
				COREPACK_ENABLE_AUTO_PIN: "0",
				...options.env,
			},
			maxBuffer: 64 * 1024 * 1024,
			stdio: options.capture ? "pipe" : "inherit",
		});
	} catch (error) {
		if (error.stdout?.trim()) console.error(error.stdout.trim());
		if (error.stderr?.trim()) console.error(error.stderr.trim());
		throw new Error(`Command failed: ${command} ${args.join(" ")}`, {
			cause: error,
		});
	}
}

async function packLocalPackage(packageDirectory, artifactsDirectory) {
	const result = await run(
		"npm",
		["pack", "--quiet", "--pack-destination", artifactsDirectory],
		{ cwd: packageDirectory, capture: true },
	);
	const tarballName = result.stdout.trim().split(/\s+/).at(-1);
	if (!tarballName?.endsWith(".tgz")) {
		throw new Error(`npm pack did not report a tarball: ${result.stdout}`);
	}
	return realpath(join(artifactsDirectory, basename(tarballName)));
}

async function packPublicCompanion(artifactsDirectory) {
	const result = await run(
		"npm",
		[
			"pack",
			`@btst/better-auth-ui@${BETTER_AUTH_UI_VERSION}`,
			"--quiet",
			"--pack-destination",
			artifactsDirectory,
		],
		{ cwd: REPOSITORY_ROOT, capture: true },
	);
	const tarballName = result.stdout.trim().split(/\s+/).at(-1);
	if (!tarballName?.endsWith(".tgz")) {
		throw new Error(`npm pack did not report a tarball: ${result.stdout}`);
	}
	return realpath(join(artifactsDirectory, basename(tarballName)));
}

async function prepareArtifacts(tempRoot) {
	await run("pnpm", ["--filter", "@btst/stack", "build"], {
		cwd: REPOSITORY_ROOT,
	});
	await run("pnpm", ["--filter", "@btst/codegen", "build"], {
		cwd: REPOSITORY_ROOT,
	});

	const artifactsDirectory = join(tempRoot, "artifacts");
	await mkdir(artifactsDirectory, { recursive: true });
	return {
		stack: await packLocalPackage(
			join(REPOSITORY_ROOT, "packages/stack"),
			artifactsDirectory,
		),
		codegen: await packLocalPackage(CLI_DIRECTORY, artifactsDirectory),
		betterAuthUi: await packPublicCompanion(artifactsDirectory),
	};
}

async function patchManifest(projectDirectory, artifacts, framework) {
	const manifestPath = join(projectDirectory, "package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	manifest.private = true;
	manifest.dependencies = {
		...manifest.dependencies,
		"@btst/adapter-memory": "2.2.3",
		"@btst/better-auth-ui": `file:${artifacts.betterAuthUi}`,
		"@btst/db": AUTH_COHORT["@btst/db"],
		"@btst/stack": `file:${artifacts.stack}`,
		"@btst/yar": "1.3.2",
		"@better-auth/api-key": AUTH_COHORT["@better-auth/api-key"],
		"@better-auth/core": AUTH_COHORT["@better-auth/core"],
		"@better-auth/passkey": AUTH_COHORT["@better-auth/passkey"],
		"@better-auth/utils": AUTH_COHORT["@better-auth/utils"],
		"@better-fetch/fetch": AUTH_COHORT["@better-fetch/fetch"],
		"@tanstack/react-query": "5.102.0",
		"better-auth": AUTH_COHORT["better-auth"],
		"better-call": AUTH_COHORT["better-call"],
		"next-themes": "0.4.6",
	};
	manifest.devDependencies = {
		...manifest.devDependencies,
		"@btst/codegen": `file:${artifacts.codegen}`,
		...(framework === "tanstack" ? { eslint: "10.0.1" } : {}),
	};
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function collectNamedVersions(tree, packageName, versions = new Set()) {
	if (!tree || typeof tree !== "object") return versions;
	if (Array.isArray(tree)) {
		for (const item of tree) collectNamedVersions(item, packageName, versions);
		return versions;
	}
	for (const [name, dependency] of Object.entries(tree.dependencies ?? {})) {
		if (name === packageName && typeof dependency.version === "string") {
			versions.add(dependency.version);
		}
		collectNamedVersions(dependency, packageName, versions);
	}
	return versions;
}

async function assertCohort(projectDirectory) {
	const problems = [];
	for (const [packageName, expected] of Object.entries(AUTH_COHORT)) {
		const versions = new Set();
		for (const depth of ["0", "Infinity"]) {
			const result = await run(
				"pnpm",
				["list", packageName, "--json", "--depth", depth],
				{ cwd: projectDirectory, capture: true },
			);
			collectNamedVersions(JSON.parse(result.stdout), packageName, versions);
		}
		const found = [...versions].sort();
		if (found.length !== 1 || found[0] !== expected) {
			problems.push(
				`${packageName}: expected only ${expected}; found ${found.join(", ") || "nothing"}`,
			);
		}
	}
	if (problems.length > 0) {
		throw new Error(`Auth cohort mismatch:\n- ${problems.join("\n- ")}`);
	}
}

async function assertGeneratedBoundary(projectDirectory, config) {
	const authClient = await readFile(
		join(projectDirectory, config.authClientPath),
		"utf8",
	);
	const stackClient = await readFile(
		join(projectDirectory, config.stackClientPath),
		"utf8",
	);
	const provider = await readFile(
		join(projectDirectory, config.providerPath),
		"utf8",
	);
	const css = await readFile(join(projectDirectory, config.cssFile), "utf8");
	const backend = await readFile(
		join(
			projectDirectory,
			config.stackClientPath.replace("stack-client.tsx", "stack.ts"),
		),
		"utf8",
	);

	const requirements = [
		[authClient.includes("createAuthClient"), "browser auth client"],
		[authClient.includes('basePath: "/api/auth"'), "existing endpoint seam"],
		[stackClient.includes("auth: authClientPlugin()"), "auth plugin"],
		[stackClient.includes("account: accountClientPlugin()"), "account plugin"],
		[
			!stackClient.includes("organizationClientPlugin"),
			"no organization plugin",
		],
		[provider.includes(config.refresh), "framework session refresh"],
		[provider.includes("account: true"), "account override"],
		[!provider.includes("organization:"), "no organization override"],
		[!provider.includes("apiKey:"), "no API-key opt-in"],
		[!provider.includes("passkey:"), "no passkey opt-in"],
		[css.includes("@btst/better-auth-ui/css"), "companion CSS"],
		[!backend.includes("better-auth"), "no Better Auth backend"],
	];
	const missing = requirements.filter(([ok]) => !ok).map(([, label]) => label);
	if (missing.length > 0) {
		throw new Error(`Generated boundary failed: ${missing.join(", ")}`);
	}
}

async function scaffoldFramework(tempRoot, framework, artifacts) {
	const config = FIXTURE_CONFIG[framework];
	const projectName = `better-auth-ui-${framework}`;
	const projectDirectory = join(tempRoot, projectName);

	await run(
		"pnpm",
		[
			"dlx",
			`shadcn@${SHADCN_VERSION}`,
			"init",
			"-t",
			config.template,
			"--no-monorepo",
			"--base",
			"radix",
			"--preset",
			"nova",
			"--name",
			projectName,
			"--yes",
		],
		{ cwd: tempRoot },
	);
	await run(
		"pnpm",
		[
			"dlx",
			`shadcn@${SHADCN_VERSION}`,
			"add",
			"dropdown-menu",
			"--yes",
			"--overwrite",
		],
		{ cwd: projectDirectory },
	);

	await rm(join(projectDirectory, ".git"), { recursive: true, force: true });
	await rm(join(projectDirectory, "node_modules"), {
		recursive: true,
		force: true,
	});
	await rm(join(projectDirectory, "pnpm-lock.yaml"), { force: true });
	await rm(join(projectDirectory, "package-lock.json"), { force: true });
	await patchManifest(projectDirectory, artifacts, framework);

	await run("pnpm", ["install", "--strict-peer-dependencies"], {
		cwd: projectDirectory,
	});
	await run(
		"pnpm",
		[
			"exec",
			"btst",
			"init",
			"--yes",
			"--framework",
			framework,
			"--adapter",
			"memory",
			"--plugins",
			"better-auth-ui",
			"--skip-install",
		],
		{ cwd: projectDirectory },
	);

	await assertGeneratedBoundary(projectDirectory, config);
	await assertCohort(projectDirectory);
	await run("pnpm", ["run", "build"], {
		cwd: projectDirectory,
		env: config.env,
	});
	const generatedManifest = JSON.parse(
		await readFile(join(projectDirectory, "package.json"), "utf8"),
	);
	const typecheckCommand = generatedManifest.scripts?.typecheck
		? ["run", "typecheck"]
		: ["exec", "tsc", "--noEmit"];
	await run("pnpm", typecheckCommand, {
		cwd: projectDirectory,
		env: config.env,
	});
	logStep(`${framework} packed fixture passed`);
}

async function main() {
	assertNode22();
	const frameworks = selectedFrameworks();
	const tempRoot = await mkdtemp(join(tmpdir(), "btst-better-auth-ui-"));
	let passed = false;
	try {
		const artifacts = await prepareArtifacts(tempRoot);
		for (const framework of frameworks) {
			await scaffoldFramework(tempRoot, framework, artifacts);
		}
		passed = true;
		logStep(`all packed fixtures passed: ${frameworks.join(", ")}`);
	} finally {
		if (passed || process.env.BTST_KEEP_FIXTURES !== "1") {
			await rm(tempRoot, { recursive: true, force: true });
		} else {
			console.error(`Fixture retained for debugging: ${tempRoot}`);
		}
	}
}

await main();
