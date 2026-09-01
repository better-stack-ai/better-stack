import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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
			"form-builder",
			"open-api",
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
});
