import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PLUGIN_DECISIONS } from "../plugin-decision";

const packageRoot = resolve(import.meta.dirname, "../../..");
const manifestPath = resolve(packageRoot, "plugin-decisions.json");
const packageJsonPath = resolve(packageRoot, "package.json");
const generatorPath = resolve(
	packageRoot,
	"scripts/generate-plugin-decisions.ts",
);
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");
const execFileAsync = promisify(execFile);

describe("published plugin decision manifest", () => {
	it("matches the versioned core decision inventory byte for byte", async () => {
		const contents = await readFile(manifestPath, "utf8");
		const manifest = JSON.parse(contents);

		expect(manifest).toEqual({ schemaVersion: 1, plugins: PLUGIN_DECISIONS });
		expect(Object.keys(manifest.plugins)).toEqual([
			"search",
			"notifications",
			"blog",
			"ai-chat",
			"cms",
			"form-builder",
			"ui-builder",
			"job-board",
			"kanban",
			"crm",
			"newsletter",
			"school",
			"affiliate",
			"analytics",
			"ecommerce",
			"feature-flags",
			"feedback",
			"calendar",
			"helpdesk",
			"comments",
			"media",
			"route-docs",
			"open-api",
			"better-auth-ui",
		]);
		await expect(
			execFileAsync(process.execPath, [tsxCli, generatorPath, "--check"]),
		).resolves.toMatchObject({ stderr: "" });
	});

	it("ships the JSON artifact through the public package contract", async () => {
		const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

		expect(packageJson.files).toContain("plugin-decisions.json");
		expect(packageJson.exports["./plugin-decisions.json"]).toBe(
			"./plugin-decisions.json",
		);
		expect(packageJson.scripts["plugin-decisions:generate"]).toBeDefined();
		expect(packageJson.scripts["plugin-decisions:check"]).toBeDefined();
	});

	it("links each catalog entry to the package that owns its source", async () => {
		const repositoryRoot = resolve(packageRoot, "../..");
		const prefix = "/better-stack-ai/better-stack/tree/main/";
		for (const [key, decision] of Object.entries(PLUGIN_DECISIONS)) {
			if (key === "better-auth-ui") {
				expect(decision.sourcePath).toBe(
					"https://github.com/better-stack-ai/better-auth-ui",
				);
				continue;
			}
			const url = new URL(decision.sourcePath);
			expect(url.origin).toBe("https://github.com");
			expect(url.pathname.startsWith(prefix), decision.sourcePath).toBe(true);
			const sourcePath = url.pathname.slice(prefix.length);
			expect(sourcePath.split("/").slice(0, 2)).toEqual([
				"packages",
				`plugin-${key}`,
			]);
			expect(
				(await stat(resolve(repositoryRoot, sourcePath))).isDirectory(),
			).toBe(true);
			const owner = JSON.parse(
				await readFile(
					resolve(repositoryRoot, "packages", `plugin-${key}`, "package.json"),
					"utf8",
				),
			);
			expect(owner.name, decision.sourcePath).toBe(`@btst/plugin-${key}`);
		}
	});

	it("rejects an existing empty manifest instead of treating it as missing", async () => {
		const temporaryRoot = await mkdtemp(join(tmpdir(), "btst-decisions-"));
		const emptyManifestPath = join(temporaryRoot, "plugin-decisions.json");
		await writeFile(emptyManifestPath, "", "utf8");

		try {
			await expect(
				execFileAsync(process.execPath, [tsxCli, generatorPath, "--check"], {
					env: {
						...process.env,
						BTST_PLUGIN_DECISIONS_MANIFEST_PATH: emptyManifestPath,
					},
				}),
			).rejects.toMatchObject({
				stderr: expect.stringContaining("Plugin decision manifest drifted"),
			});
		} finally {
			await rm(temporaryRoot, { recursive: true, force: true });
		}
	});

	it("reports a missing manifest distinctly from an empty one", async () => {
		const temporaryRoot = await mkdtemp(join(tmpdir(), "btst-decisions-"));
		const missingManifestPath = join(temporaryRoot, "missing.json");

		try {
			await expect(
				execFileAsync(process.execPath, [tsxCli, generatorPath, "--check"], {
					env: {
						...process.env,
						BTST_PLUGIN_DECISIONS_MANIFEST_PATH: missingManifestPath,
					},
				}),
			).rejects.toMatchObject({
				stderr: expect.stringContaining("Plugin decision manifest is missing"),
			});
		} finally {
			await rm(temporaryRoot, { recursive: true, force: true });
		}
	});
});
