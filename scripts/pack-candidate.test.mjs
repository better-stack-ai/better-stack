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
import { test } from "node:test";
import { packCandidate } from "./pack-candidate.mjs";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "btst-candidate-pack-"));
	const packageDir = join(root, "packages", "feature");
	const dependency = join(root, "packages", "dependency");
	await mkdir(join(packageDir, "dist"), { recursive: true });
	await mkdir(join(packageDir, "node_modules", "@btst"), { recursive: true });
	await mkdir(dependency, { recursive: true });
	await writeFile(join(root, ".gitignore"), "node_modules\n");
	await writeFile(join(root, "package.json"), '{"private":true}\n');
	await writeFile(
		join(root, "pnpm-workspace.yaml"),
		"packages:\n  - packages/*\n",
	);
	await writeFile(
		join(dependency, "package.json"),
		JSON.stringify({ name: "@btst/candidate-dependency", version: "1.2.3" }),
	);
	await symlink(
		dependency,
		join(packageDir, "node_modules", "@btst", "candidate-dependency"),
	);
	const manifest = {
		name: "@btst/plugin-candidate-fixture",
		version: "1.0.0",
		files: ["dist"],
		publishConfig: { access: "public" },
		dependencies: { "@btst/candidate-dependency": "workspace:^" },
	};
	await writeFile(
		join(packageDir, "package.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	await writeFile(
		join(packageDir, "dist", "index.mjs"),
		"export const answer = 42;\n",
	);
	const git = (...args) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	git("init", "-q");
	git("config", "user.name", "Candidate packing");
	git("config", "user.email", "candidate@example.invalid");
	git("add", ".");
	git("commit", "-qm", "Candidate source");
	return { root, packageDir, gitHead: git("rev-parse", "HEAD") };
}

test("packed candidates retain exact source identity and consumer dependency ranges", async () => {
	const { root, packageDir, gitHead } = await fixture();
	try {
		const before = await readFile(join(packageDir, "package.json"));
		const packed = await packCandidate({
			packageDir,
			destination: join(root, "artifacts"),
			expectedSha: gitHead,
		});
		const manifest = JSON.parse(
			execFileSync("tar", ["-xOf", packed.path, "package/package.json"], {
				encoding: "utf8",
			}),
		);
		assert.equal(manifest.gitHead, gitHead);
		assert.equal(manifest.name, "@btst/plugin-candidate-fixture");
		assert.equal(manifest.version, "1.0.0");
		assert.equal(manifest.dependencies["@btst/candidate-dependency"], "^1.2.3");
		assert.deepEqual(packed.manifest, manifest);
		assert.match(packed.integrity, /^sha512-/);
		assert.ok(packed.bytes > 0);
		assert.deepEqual(await readFile(join(packageDir, "package.json")), before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("failed packs and mismatched candidate sources leave the original manifest intact", async () => {
	const { root, packageDir } = await fixture();
	try {
		const file = join(packageDir, "package.json");
		const manifest = JSON.parse(await readFile(file, "utf8"));
		await writeFile(
			file,
			`${JSON.stringify({ ...manifest, scripts: { prepack: 'node -e "process.exit(23)"' } }, null, 4)}\n`,
		);
		const before = await readFile(file);
		const options = { packageDir, destination: join(root, "artifacts") };
		await assert.rejects(packCandidate(options));
		assert.deepEqual(await readFile(file), before);
		await assert.rejects(
			packCandidate({ ...options, expectedSha: "f".repeat(40) }),
			/Candidate SHA does not match/,
		);
		assert.deepEqual(await readFile(file), before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
