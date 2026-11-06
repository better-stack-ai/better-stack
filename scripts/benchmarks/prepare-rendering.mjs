import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConsumerManifest } from "../packed-consumer/runner.mjs";

const option = (name) => process.argv[process.argv.indexOf(name) + 1];
assert(
	process.argv.includes("--artifacts") && process.argv.includes("--output"),
	"Usage: node scripts/benchmarks/prepare-rendering.mjs --artifacts DIR --output DIR",
);
const artifacts = resolve(option("--artifacts"));
const output = resolve(option("--output"));
const template = fileURLToPath(new URL("./rendering-app/", import.meta.url));
const names = [
	"@btst/stack",
	"@btst/plugin-blog",
	"@btst/plugin-cms",
	"@btst/plugin-kanban",
];
const candidates = {};
const manifests = {};
for (const file of await readdir(artifacts)) {
	if (!file.endsWith(".tgz")) continue;
	const path = join(artifacts, file);
	const manifest = JSON.parse(
		execFileSync("tar", ["-xOf", path, "package/package.json"], {
			encoding: "utf8",
		}),
	);
	if (!names.includes(manifest.name)) continue;
	candidates[manifest.name] = path;
	manifests[manifest.name] = manifest;
}
for (const name of names) assert(candidates[name], `Missing candidate ${name}`);
await mkdir(output, { recursive: true });
const registry = await fetch("https://registry.npmjs.org/@btst%2fstack/5.2.0");
assert(registry.ok, `Baseline registry response ${registry.status}`);
const baseline = await registry.json();
assert.equal(baseline.gitHead, "2e176fe1d83866de1decd1109bc2efd05ac3d18e");
const response = await fetch(baseline.dist.tarball);
assert(response.ok, `Baseline archive response ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(
	`sha512-${createHash("sha512").update(bytes).digest("base64")}`,
	baseline.dist.integrity,
);
const baselinePath = join(output, "btst-stack-5.2.0.tgz");
await writeFile(baselinePath, bytes);
const manifest = createConsumerManifest({
	fixture: "blog",
	stackTarball: candidates["@btst/stack"],
	packageTarballs: Object.fromEntries(
		Object.entries(candidates).filter(([name]) => name !== "@btst/stack"),
	),
	packageManifests: manifests,
	fixtureDependencies: {
		next: "16.4.5",
		tailwindcss: "4.3.3",
		"@tailwindcss/postcss": "4.3.3",
		"@tailwindcss/typography": "0.5.19",
	},
});
const provenance = {
	harnessGitHead: execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
		cwd: fileURLToPath(new URL("../../", import.meta.url)),
	}).trim(),
	baseline: {
		name: baseline.name,
		version: baseline.version,
		gitHead: baseline.gitHead,
		integrity: baseline.dist.integrity,
	},
	candidate: Object.fromEntries(
		Object.entries(manifests).map(([name, value]) => [
			name,
			{ version: value.version, gitHead: value.gitHead },
		]),
	),
	createdAt: new Date().toISOString(),
};
for (const [name, path] of Object.entries(candidates)) {
	const buffer = await readFile(path);
	provenance.candidate[name].integrity =
		`sha512-${createHash("sha512").update(buffer).digest("base64")}`;
	provenance.candidate[name].bytes = buffer.length;
}
const featureDependencies = Object.assign(
	{},
	...Object.values(manifests).map((value) => value.dependencies),
);
for (const name of Object.keys(featureDependencies))
	if (name.startsWith("@btst/")) delete featureDependencies[name];
for (const variant of ["v5", "v6"]) {
	const directory = join(output, variant);
	await mkdir(directory, { recursive: true });
	const dependencies = {
		...featureDependencies,
		...manifest.dependencies,
		"lucide-react": "1.7.0",
	};
	if (variant === "v5") {
		for (const name of names.filter((name) => name !== "@btst/stack"))
			delete dependencies[name];
		dependencies["@btst/stack"] = baselinePath;
	}
	const pkg = {
		...manifest,
		name: `btst-rendering-${variant}`,
		scripts: {
			build: "next build --webpack",
			start: "next start --hostname 127.0.0.1",
		},
		dependencies,
	};
	// Hold the framework and shared runtime packages identical in both dependency trees.
	pkg.pnpm = {
		...pkg.pnpm,
		overrides: {
			...pkg.pnpm?.overrides,
			react: "19.3.1",
			"react-dom": "19.3.1",
			"lucide-react": "1.7.0",
		},
	};
	await writeFile(
		join(directory, "package.json"),
		`${JSON.stringify(pkg, null, 2)}\n`,
	);
	await writeFile(join(directory, "pnpm-workspace.yaml"), "packages: []\n");
	for (const file of await readdir(template, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!file.isFile()) continue;
		const path = join(file.parentPath, file.name);
		const relative = path.slice(template.length);
		let source = await readFile(path, "utf8");
		if (variant === "v5")
			source = source.replaceAll(
				/@btst\/plugin-([a-z-]+)(?=\/)/g,
				"@btst/stack/plugins/$1",
			);
		await mkdir(join(directory, relative, ".."), { recursive: true });
		await writeFile(join(directory, relative), source);
	}
}
await writeFile(
	join(output, "provenance.json"),
	`${JSON.stringify(provenance, null, 2)}\n`,
);
console.log(
	JSON.stringify({
		output,
		baseline: baseline.version,
		candidate: manifests["@btst/stack"].version,
	}),
);
