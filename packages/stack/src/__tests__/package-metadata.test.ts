import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("published dependency alignment", () => {
	it("uses the Better DB release that shares the Better Auth 1.6.16 cohort", async () => {
		const manifest = JSON.parse(
			await readFile(resolve("package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};

		expect(manifest.dependencies?.["@btst/db"]).toBe("2.2.3");
		expect(manifest.devDependencies?.["@btst/adapter-memory"]).toBe("2.2.3");
		expect(manifest.devDependencies?.["@btst/yar"]).toBe("1.3.2");
		expect(manifest.peerDependencies?.["@btst/yar"]).toBe(">=1.3.2");
		expect(manifest.peerDependencies?.["better-call"]).toBe("1.3.6");
	});
});

describe("published symmetric stack constructors", () => {
	it("exposes canonical and temporary names through ESM, CJS, declarations and typesVersions", async () => {
		const manifest = JSON.parse(
			await readFile(resolve("package.json"), "utf8"),
		) as {
			exports?: Record<string, unknown>;
			typesVersions?: Record<string, Record<string, string[]>>;
		};
		expect(manifest.exports).toHaveProperty("./api");
		expect(manifest.exports).toHaveProperty("./client");
		expect(manifest.typesVersions?.["*"]?.api).toEqual([
			"./dist/api/index.d.ts",
		]);
		expect(manifest.typesVersions?.["*"]?.client).toEqual([
			"./dist/client/index.d.ts",
		]);

		const apiDeclaration = await readFile(
			resolve("dist/api/index.d.ts"),
			"utf8",
		);
		const clientDeclaration = await readFile(
			resolve("dist/client/index.d.ts"),
			"utf8",
		);
		expect(apiDeclaration).toContain("function createBackendStack");
		expect(apiDeclaration).toContain("const stack: typeof createBackendStack");
		expect(apiDeclaration).toContain("BackendStackConfig");
		expect(apiDeclaration).toContain("BackendStack<");
		expect(clientDeclaration).toContain("function createClientStack");
		expect(clientDeclaration).toContain(
			"const createStackClient: typeof createClientStack",
		);
		expect(clientDeclaration).toContain("ClientStackConfig");
		expect(clientDeclaration).toContain("ClientStack<");

		const apiSpecifier = "@btst/stack/api";
		const clientSpecifier = "@btst/stack/client";
		const esmApi = await import(apiSpecifier);
		const esmClient = await import(clientSpecifier);
		const require = createRequire(import.meta.url);
		const cjsApi = require(apiSpecifier);
		const cjsClient = require(clientSpecifier);

		expect(esmApi.stack).toBe(esmApi.createBackendStack);
		expect(esmClient.createStackClient).toBe(esmClient.createClientStack);
		expect(cjsApi.stack).toBe(cjsApi.createBackendStack);
		expect(cjsClient.createStackClient).toBe(cjsClient.createClientStack);

		await execFileAsync(
			process.execPath,
			[
				require.resolve("typescript/lib/tsc.js"),
				"--project",
				"consumer-tests/constructor-exports/tsconfig.json",
			],
			{ cwd: resolve(".") },
		);
	});
});
