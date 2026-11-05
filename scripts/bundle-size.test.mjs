import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { measure, measureWorkspace, report, summary } from "./bundle-size.mjs";

const fixtures = [];

async function fixture(files) {
	const dir = await mkdtemp(join(tmpdir(), "btst-bundle-size-"));
	fixtures.push(dir);
	for (const [name, content] of Object.entries(files)) {
		await mkdir(dirname(join(dir, name)), { recursive: true });
		await writeFile(join(dir, name), content);
	}
	return dir;
}

afterEach(async () => {
	await Promise.all(
		fixtures.splice(0).map((dir) => rm(dir, { recursive: true })),
	);
});

describe("consumer bundle measurements", () => {
	it("reports public package archives separately from exported module costs", async () => {
		const dir = await fixture({
			"package.json": '{"private":true,"packageManager":"pnpm@10.17.1"}',
			"pnpm-workspace.yaml": "packages:\n  - packages/*\n",
			"packages/stack/package.json": JSON.stringify({
				name: "@btst/stack",
				version: "6.0.0",
				files: ["dist"],
				exports: { ".": { import: { default: "./dist/index.mjs" } } },
			}),
			"packages/stack/dist/index.mjs": "export const answer = 42;",
			"packages/components/package.json": JSON.stringify({
				name: "@btst/components",
				version: "1.0.0",
				files: ["dist"],
				exports: { "./empty": { import: { default: "./dist/index.mjs" } } },
			}),
			"packages/components/dist/index.mjs": 'export const message = "empty";',
			"packages/ui/package.json":
				'{"name":"@workspace/ui","version":"0.0.0","private":true}',
		});
		const git = (...args) =>
			execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
		git("init", "-q");
		git("config", "user.name", "Size fixture");
		git("config", "user.email", "size@example.invalid");
		git("add", ".");
		git("commit", "-qm", "Published inputs");
		const snapshot = await measureWorkspace(dir, git("rev-parse", "HEAD"));
		expect(snapshot.archives.map((archive) => archive.name).sort()).toEqual([
			"@btst/components",
			"@btst/stack",
		]);
		expect(
			snapshot.archives.every(
				(archive) => archive.bytes > 0 && archive.gitHead === snapshot.revision,
			),
		).toBe(true);
		expect(snapshot.entries.map((entry) => entry.name).sort()).toEqual([
			"@btst/components/empty",
			"@btst/stack",
		]);
		const output = report(snapshot, snapshot);
		expect(output).toContain("Packed archives");
		expect(output).toContain("Archive bytes exclude installed dependencies");
		expect(output).toContain("Rows overlap; do not sum");
	});
	it("follows re-exports and dependencies, retains all exports, and excludes host runtimes", async () => {
		const dir = await fixture({
			"package.json": JSON.stringify({
				name: "@btst/stack",
				exports: {
					"./plugins/blog/client": {
						import: { default: "./dist/index.mjs" },
					},
					"./dist/*": "./dist/*",
					"./package.json": "./package.json",
				},
			}),
			"dist/index.mjs":
				'export * from "./shared.mjs"; export { data } from "dependency"; export { useState } from "react"; export { jsx } from "react/jsx-runtime"; export { readFile } from "node:fs";',
			"dist/shared.mjs": `export const first = "${"a".repeat(1000)}"; export const second = "${"b".repeat(1000)}";`,
			"node_modules/dependency/package.json": '{"main":"index.js"}',
			"node_modules/dependency/index.js": 'exports.data = "small";',
		});
		const base = await measure(dir, "base");
		expect(base.entries).toHaveLength(1);
		expect(base.entries[0]).toMatchObject({
			name: "@btst/stack/plugins/blog/client",
			group: "Plugin: blog",
			kind: "JavaScript",
		});
		expect(base.entries[0].bytes).toBeGreaterThan(2000);
		await writeFile(
			join(dir, "node_modules/dependency/index.js"),
			`exports.data = "${"dependency-growth".repeat(500)}";`,
		);
		const head = await measure(dir, "head");
		expect(head.entries[0].bytes).toBeGreaterThan(base.entries[0].bytes + 8000);
		expect(head.entries[0].gzip).toBeGreaterThan(base.entries[0].gzip);
		expect(await measure(dir, "head")).toEqual(head);
	});

	it("measures imported stylesheets and keeps URL assets external", async () => {
		const dir = await fixture({
			"package.json": JSON.stringify({
				name: "@btst/stack",
				exports: { "./plugins/blog/css": "./dist/style.css" },
			}),
			"dist/style.css":
				'@import "./theme.css"; .editor { color: red; background: url("./missing-image.png") }',
			"dist/theme.css": ".theme { color: blue }",
		});
		const base = await measure(dir, "base");
		expect(base.entries[0].kind).toBe("CSS");
		await writeFile(
			join(dir, "dist/theme.css"),
			".theme { color: blue; margin: 10px; padding: 5px; display: flex }",
		);
		const head = await measure(dir, "head");
		expect(head.entries[0].bytes).toBeGreaterThan(base.entries[0].bytes);
	});

	it("fails instead of reporting zero when a dependency cannot be resolved", async () => {
		const dir = await fixture({
			"package.json": JSON.stringify({
				name: "@btst/stack",
				exports: { ".": { import: { default: "./index.mjs" } } },
			}),
			"index.mjs": 'export * from "missing-dependency";',
		});
		await expect(measure(dir, "head")).rejects.toThrow();
	});

	it("flags missing declared outputs without treating them as zero or new bundles", async () => {
		const dir = await fixture({
			"package.json": JSON.stringify({
				name: "@btst/stack",
				exports: {
					"./plugins/ui-builder": { import: { default: "./index.mjs" } },
					"./ui/css": "./missing.css",
				},
			}),
			"index.mjs": "export const value = 42;",
		});
		const base = await measure(dir, "base");
		expect(base.unavailable).toEqual(["@btst/stack/ui/css"]);
		expect(base.entries[0].group).toBe("Plugin: ui-builder");
		await writeFile(join(dir, "missing.css"), ".editor { color: red }");
		const head = await measure(dir, "head");
		const result = report(base, head);
		expect(result).toContain("0 of 1 bundles changed");
		expect(result).toContain("**Merge-base: missing declared build outputs**");
		expect(result).not.toContain("(new)");
	});
});

describe("bundle comparison", () => {
	it("reports growth, reductions, unchanged, new, removed, and empty bundles", () => {
		const entry = (name, bytes, gzip) => ({
			name,
			group: "Core",
			kind: "JavaScript",
			bytes,
			gzip,
		});
		const result = report(
			{
				revision: "base-sha",
				unavailable: [],
				entries: [
					entry("growing", 100, 50),
					entry("shrinking", 100, 50),
					entry("unchanged", 100, 50),
					entry("removed", 100, 50),
					entry("empty", 0, 20),
				],
			},
			{
				revision: "head-sha",
				unavailable: [],
				entries: [
					entry("growing", 120, 60),
					entry("shrinking", 80, 40),
					entry("unchanged", 100, 50),
					entry("new", 100, 50),
					entry("empty", 10, 25),
				],
			},
		);
		expect(result).toContain("5 of 6 bundles changed");
		expect(result).toContain("+20 B (+20.0%)");
		expect(result).toContain("-20 B (-20.0%)");
		expect(result).toContain("`new` (new)");
		expect(result).toContain("`removed` (removed)");
		expect(result).toContain("`unchanged`");
		expect(result).toContain("`base-sha`");
		expect(result).toContain("`head-sha`");
		expect(result).not.toMatch(/NaN|Infinity/);
		expect(result.indexOf("`new`")).toBeLessThan(result.indexOf("`growing`"));
	});
});

describe("PR comment summary", () => {
	const snapshot = (entries, unavailable = []) => ({
		revision: "abcdef123456",
		entries,
		unavailable,
	});

	it("keeps an unchanged library short and leaves all rows in the full report", () => {
		const entries = Array.from({ length: 164 }, (_, i) => ({
			name: `module-${i}`,
			group: "Core",
			kind: "JavaScript",
			bytes: 100,
			gzip: 50,
		}));
		const base = snapshot(entries, ["@btst/stack/ui/css"]);
		const result = summary(base, base);
		expect(result).toContain("No size changes across **164 bundles**");
		expect(result).not.toContain("| Module");
		expect(result).not.toContain("module-163");
		expect(result).toContain("Unavailable: `@btst/stack/ui/css`");
		expect(result.length).toBeLessThan(500);
		expect(report(base, base)).toContain("`module-163`");
	});

	it("caps changed rows at ten and ranks reductions alongside growth", () => {
		const entries = Array.from({ length: 20 }, (_, i) => ({
			name: `@btst/stack/module-${i}`,
			bytes: 2000,
			gzip: 1000,
		}));
		const head = entries.map((entry, i) => ({
			...entry,
			bytes: entry.bytes + i + 1,
			gzip: entry.gzip + (i === 19 ? -20 : i + 1),
		}));
		const result = summary(snapshot(entries), snapshot(head));
		expect(result).toContain("20 of 20 bundles changed");
		expect(result.match(/^\| `module-/gm)).toHaveLength(10);
		expect(result).not.toContain("`module-0`");
		expect(result.indexOf("`module-19`")).toBeLessThan(
			result.indexOf("`module-18`"),
		);
		expect(result).toContain("-20 B (-2.0%)");
		expect(result).toContain("Showing the 10 largest changes");
	});

	it("includes raw-only changes and new/removed bundles while omitting unavailable comparisons", () => {
		const entry = (name, bytes = 100) => ({ name, bytes, gzip: 50 });
		const result = summary(
			snapshot([entry("raw-only"), entry("removed")], ["missing"]),
			snapshot([entry("raw-only", 110), entry("new"), entry("missing")]),
		);
		expect(result).toContain("3 of 3 bundles changed");
		expect(result).toContain("`raw-only`");
		expect(result).toContain("+10 B (+10.0%)");
		expect(result).toContain("`new` (new)");
		expect(result).toContain("`removed` (removed)");
		expect(result).toContain("Unavailable: `missing`");
		expect(result).not.toContain("| `missing`");
	});
});
