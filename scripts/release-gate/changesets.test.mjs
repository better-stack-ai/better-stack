import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { packCandidate } from "../pack-candidate.mjs";

const cli = fileURLToPath(
	new URL("../../node_modules/@changesets/cli/bin.js", import.meta.url),
);
const modules = fileURLToPath(new URL("../../node_modules", import.meta.url));

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "btst-changesets-"));
	await mkdir(join(root, ".changeset"));
	await writeFile(
		join(root, ".changeset", "config.json"),
		await readFile(new URL("../../.changeset/config.json", import.meta.url)),
	);
	await writeFile(
		join(root, "package.json"),
		'{"name":"release-fixture","private":true,"packageManager":"pnpm@10.17.1"}\n',
	);
	await writeFile(
		join(root, "pnpm-workspace.yaml"),
		"packages:\n  - packages/*\n",
	);
	await writeFile(join(root, ".gitignore"), "node_modules\n");
	await symlink(modules, join(root, "node_modules"));
	const packages = {
		stack: { name: "@btst/stack", version: "6.0.0" },
		blog: {
			name: "@btst/plugin-blog",
			version: "1.0.0",
			peerDependencies: { "@btst/stack": ">=6.0.0 <7.0.0" },
		},
		ai: {
			name: "@btst/plugin-ai-chat",
			version: "1.0.0",
			peerDependencies: { "@btst/stack": ">=6.0.0 <7.0.0" },
		},
		cms: { name: "@btst/plugin-cms", version: "1.0.0" },
		ecommerce: {
			name: "@btst/plugin-ecommerce",
			version: "1.0.0",
			dependencies: { "@btst/plugin-cms": "workspace:^" },
		},
	};
	for (const [directory, manifest] of Object.entries(packages)) {
		await mkdir(join(root, "packages", directory), { recursive: true });
		await writeFile(
			join(root, "packages", directory, "package.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
	}
	const git = (...args) =>
		execFileSync("git", args, {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Release plan fixture");
	git("config", "user.email", "release@example.invalid");
	git("add", ".");
	git("commit", "-qm", "Independent packages");
	const changeset = async (name, type) =>
		writeFile(
			join(root, ".changeset", "feature.md"),
			`---\n"${name}": ${type}\n---\n\nA public package change.\n`,
		);
	const run = (...args) =>
		execFileSync(process.execPath, [cli, ...args], {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	const manifest = async (name) =>
		JSON.parse(
			await readFile(join(root, "packages", name, "package.json"), "utf8"),
		);
	return { root, changeset, run, manifest };
}

test("real Changesets stable and prerelease plans leave unrelated owners unchanged", async () => {
	for (const prerelease of [false, true]) {
		const { root, changeset, run, manifest } = await fixture();
		try {
			await changeset("@btst/plugin-blog", "patch");
			if (prerelease) run("pre", "enter", "next");
			run("status", "--output", "plan.json");
			const plan = JSON.parse(await readFile(join(root, "plan.json"), "utf8"));
			assert.deepEqual(
				plan.releases
					.filter((release) => release.type !== "none")
					.map((release) => release.name),
				["@btst/plugin-blog"],
			);
			run("version");
			assert.equal(
				(await manifest("blog")).version,
				prerelease ? "1.0.1-next.0" : "1.0.1",
			);
			assert.equal((await manifest("stack")).version, "6.0.0");
			assert.equal((await manifest("ai")).version, "1.0.0");
			assert.equal((await manifest("cms")).version, "1.0.0");
			assert.equal((await manifest("ecommerce")).version, "1.0.0");
			if (!prerelease)
				assert.match(
					await readFile(join(root, "packages/blog/CHANGELOG.md"), "utf8"),
					/1\.0\.1/,
				);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
});

test("required dependency releases update affected consumers without unrelated releases", async () => {
	const { root, changeset, run, manifest } = await fixture();
	try {
		await changeset("@btst/plugin-cms", "major");
		run("version");
		assert.equal((await manifest("cms")).version, "2.0.0");
		assert.equal((await manifest("ecommerce")).version, "1.0.1");
		assert.equal((await manifest("blog")).version, "1.0.0");
		assert.equal((await manifest("ai")).version, "1.0.0");
		assert.equal((await manifest("stack")).version, "6.0.0");
		const packageDir = join(root, "packages/ecommerce");
		await mkdir(join(packageDir, "node_modules/@btst"), { recursive: true });
		await symlink(
			join(root, "packages/cms"),
			join(packageDir, "node_modules/@btst/plugin-cms"),
		);
		const artifact = await packCandidate({
			packageDir,
			destination: join(root, "artifacts"),
		});
		assert.equal(artifact.manifest.dependencies["@btst/plugin-cms"], "^2.0.0");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
