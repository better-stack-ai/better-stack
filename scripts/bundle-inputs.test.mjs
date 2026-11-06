import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	bundleInputsChanged,
	changedBundleInputs,
	validateBaseline,
} from "./bundle-inputs.mjs";

test("documentation and app-only edits avoid bundle builds", () => {
	assert.equal(
		bundleInputsChanged([
			"docs/content/docs/plugins/blog.mdx",
			"AGENTS.md",
			"README.md",
			".agents/skills/testing/SKILL.md",
			".changeset/quiet-cloud.md",
			"e2e/tests/smoke.blog.spec.ts",
			"playground/app/page.tsx",
		]),
		false,
	);
	assert.equal(bundleInputsChanged([]), false);
});

test("all package, dependency, tooling and unknown changes require measurement", () => {
	for (const path of [
		"packages/plugin-blog/src/client/index.ts",
		"packages/ui/src/styles.css",
		"packages/stack/README.md",
		"packages/components/package.json",
		"package.json",
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
		"turbo.json",
		".nvmrc",
		".npmrc",
		"tsconfig.json",
		"patches/fix.patch",
		"scripts/package-build.ts",
		"scripts/pack-candidate.mjs",
		"scripts/bundle-size.mjs",
		".github/workflows/bundle-size.yml",
		"new-build-helper.mjs",
	]) {
		assert.equal(bundleInputsChanged(["docs/readme.md", path]), true, path);
	}
});

test("Git detection includes deletions, both sides of renames, and unusual filenames", async () => {
	const root = await mkdtemp(join(tmpdir(), "btst-bundle-inputs-"));
	const git = (...args) =>
		execFileSync("git", args, {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	try {
		git("init", "-q");
		git("config", "user.name", "Bundle inputs");
		git("config", "user.email", "bundle@example.invalid");
		await mkdir(join(root, "docs"));
		await mkdir(join(root, "packages"));
		await writeFile(
			join(root, "packages", "source\nwith spaces.ts"),
			"export const value = 1;\n",
		);
		await writeFile(join(root, "docs", "guide.md"), "Guide\n");
		git("add", ".");
		git("commit", "-qm", "Base");
		const base = git("rev-parse", "HEAD");
		await writeFile(join(root, "docs", "guide.md"), "Updated guide\n");
		git("add", ".");
		git("commit", "-qm", "Documentation");
		assert.equal(changedBundleInputs(base, "HEAD", root), false);
		await rename(
			join(root, "packages", "source\nwith spaces.ts"),
			join(root, "docs", "source.ts"),
		);
		git("add", "-A");
		git("commit", "-qm", "Move source to docs");
		assert.equal(changedBundleInputs(base, "HEAD", root), true);
		const moved = git("rev-parse", "HEAD");
		await rename(
			join(root, "docs", "source.ts"),
			join(root, "packages", "source.ts"),
		);
		git("add", "-A");
		git("commit", "-qm", "Move docs to source");
		assert.equal(changedBundleInputs(moved, "HEAD", root), true);
		assert.throws(() => changedBundleInputs("missing-ref", "HEAD", root));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("cached baseline rejects missing measurements and mismatched source identities", () => {
	const sha = "a".repeat(40);
	const baseline = {
		revision: sha,
		entries: [],
		unavailable: [],
		archives: [{ gitHead: sha, bytes: 100, integrity: "sha512-example" }],
	};
	validateBaseline(baseline, sha);
	assert.throws(
		() => validateBaseline(baseline, "b".repeat(40)),
		/source differs/,
	);
	assert.throws(
		() => validateBaseline({ ...baseline, archives: [] }, sha),
		/archive measurements/,
	);
	assert.throws(
		() => validateBaseline({ ...baseline, entries: undefined }, sha),
		/module measurements/,
	);
	assert.throws(
		() =>
			validateBaseline(
				{
					...baseline,
					archives: [{ ...baseline.archives[0], gitHead: "b".repeat(40) }],
				},
				sha,
			),
		/archive source differs/,
	);
});
