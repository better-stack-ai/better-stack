import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
			"blog",
			"ai-chat",
			"cms",
			"form-builder",
			"ui-builder",
			"kanban",
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
