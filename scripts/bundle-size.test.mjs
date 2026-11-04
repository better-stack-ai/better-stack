import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { measure, report } from "./bundle-size.mjs";

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
