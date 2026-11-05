import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatePackages, selectRelease } from "./packages.mjs";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sha = "a".repeat(40);
const manifests = {
	"packages/stack/package.json": { name: "@btst/stack", version: "6.0.0" },
	"packages/cli/package.json": { name: "@btst/codegen", version: "6.0.0" },
	"packages/plugin-blog/package.json": {
		name: "@btst/plugin-blog",
		version: "1.1.0-next.0",
	},
	"packages/plugin-ai-chat/package.json": {
		name: "@btst/plugin-ai-chat",
		version: "1.0.0",
	},
	"packages/ui/package.json": {
		name: "@workspace/ui",
		version: "0.0.0",
		private: true,
	},
};
const readGit = (command, ref) =>
	command === "ls-tree"
		? Object.keys(manifests).join("\n")
		: JSON.stringify(manifests[ref.slice(sha.length + 1)]);

test("release tags select only their exact public candidate owner and channel", () => {
	const packages = candidatePackages(sha, readGit);
	assert.equal(packages.size, 4);
	assert.deepEqual(selectRelease("@btst/plugin-blog@1.1.0-next.0", packages), {
		name: "@btst/plugin-blog",
		version: "1.1.0-next.0",
		path: "packages/plugin-blog/package.json",
		distTag: "next",
	});
	assert.equal(
		selectRelease("@btst/plugin-ai-chat@1.0.0", packages).distTag,
		"latest",
	);
	assert.equal(selectRelease("v6.0.0", packages).name, "@btst/stack");
	assert.throws(
		() => selectRelease("@btst/plugin-blog@1.0.0", packages),
		/version/,
	);
	assert.throws(
		() => selectRelease("@workspace/ui@0.0.0", packages),
		/Unknown/,
	);
	assert.throws(() => selectRelease("all", packages), /Unknown/);
	assert.throws(
		() => selectRelease("@btst/plugin-blog@1.1.0-next.0", packages, false),
		/prerelease/,
	);
});

test("release CLI requires the selected tag's exact committed clean source", async () => {
	const root = await mkdtemp(join(tmpdir(), "btst-release-selection-"));
	try {
		for (const [path, manifest] of Object.entries(manifests)) {
			await mkdir(join(root, path, ".."), { recursive: true });
			await writeFile(join(root, path), JSON.stringify(manifest));
		}
		const git = (...args) =>
			execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
		git("init", "-q");
		git("config", "user.name", "Release selection");
		git("config", "user.email", "release@example.invalid");
		git("add", ".");
		git("commit", "-qm", "Candidate");
		const tag = "@btst/plugin-blog@1.1.0-next.0";
		git("tag", tag);
		const cli = fileURLToPath(new URL("./packages.mjs", import.meta.url));
		const run = () =>
			execFileSync(process.execPath, [cli], {
				cwd: root,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					RELEASE_TAG: tag,
					GITHUB_PRERELEASE: "true",
					GITHUB_EVENT_NAME: "workflow_dispatch",
					GITHUB_REF: `refs/tags/${tag}`,
				},
			});
		assert.equal(JSON.parse(run()).sha, git("rev-parse", "HEAD"));
		const path = join(root, "packages/plugin-blog/package.json");
		const original = await readFile(path);
		await writeFile(path, `${original}\n`);
		assert.throws(run, /clean/);
		await writeFile(path, original);
		await writeFile(join(root, "another.txt"), "A later commit\n");
		git("add", ".");
		git("commit", "-qm", "Different candidate");
		assert.throws(run, /tag does not identify/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
