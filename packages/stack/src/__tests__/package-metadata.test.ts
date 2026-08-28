import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";

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
		expect(manifest.exports).toHaveProperty("./client/hooks");
		expect(manifest.typesVersions?.["*"]?.api).toEqual([
			"./dist/api/index.d.ts",
		]);
		expect(manifest.typesVersions?.["*"]?.client).toEqual([
			"./dist/client/index.d.ts",
		]);
		expect(manifest.typesVersions?.["*"]?.["client/hooks"]).toEqual([
			"./dist/client/hooks/index.d.ts",
		]);

		const apiDeclaration = await readFile(
			resolve("dist/api/index.d.ts"),
			"utf8",
		);
		const clientDeclaration = await readFile(
			resolve("dist/client/index.d.ts"),
			"utf8",
		);
		const apiCjsDeclaration = await readFile(
			resolve("dist/api/index.d.cts"),
			"utf8",
		);
		const clientCjsDeclaration = await readFile(
			resolve("dist/client/index.d.cts"),
			"utf8",
		);
		const clientEsm = await readFile(resolve("dist/client/index.mjs"), "utf8");
		const clientCjs = await readFile(resolve("dist/client/index.cjs"), "utf8");
		const pluginClientEsm = await readFile(
			resolve("dist/plugins/client/index.mjs"),
			"utf8",
		);
		const pluginClientCjs = await readFile(
			resolve("dist/plugins/client/index.cjs"),
			"utf8",
		);
		for (const serverSafeClientEntry of [
			clientEsm,
			clientCjs,
			pluginClientEsm,
			pluginClientCjs,
		]) {
			expect(serverSafeClientEntry).not.toContain("hooks/use-list-state");
			expect(serverSafeClientEntry).not.toMatch(/from ['\"]react['\"]/);
			expect(serverSafeClientEntry).not.toContain('require("react")');
		}
		for (const declaration of [apiDeclaration, apiCjsDeclaration]) {
			expect(declaration).toContain("function createBackendStack");
			expect(declaration).toContain("const stack: typeof createBackendStack");
			expect(declaration).toContain("BackendStackConfig");
			expect(declaration).toContain("BackendStack<");
			expect(declaration).toMatch(
				/@deprecated Use `createBackendStack`[\s\S]*const stack: typeof createBackendStack/,
			);
			const canonicalSignature = declaration.match(
				/function createBackendStack[\s\S]*?;/,
			)?.[0];
			expect(canonicalSignature).not.toContain("BackendLib");
		}
		for (const declaration of [clientDeclaration, clientCjsDeclaration]) {
			expect(declaration).toContain("function createClientStack");
			expect(declaration).toContain(
				"const createStackClient: typeof createClientStack",
			);
			expect(declaration).toContain("ClientStackConfig");
			expect(declaration).toContain("ClientStack<");
			expect(declaration).toMatch(
				/@deprecated Use `createClientStack`[\s\S]*const createStackClient: typeof createClientStack/,
			);
			const canonicalSignature = declaration.match(
				/function createClientStack[\s\S]*?;/,
			)?.[0];
			expect(canonicalSignature).not.toContain("ClientLib");
		}

		const apiSpecifier = "@btst/stack/api";
		const clientSpecifier = "@btst/stack/client";
		const clientHooksSpecifier = "@btst/stack/client/hooks";
		const esmApi = await import(apiSpecifier);
		const esmClient = await import(clientSpecifier);
		const esmClientHooks = await import(clientHooksSpecifier);
		const require = createRequire(import.meta.url);
		const cjsApi = require(apiSpecifier);
		const cjsClient = require(clientSpecifier);
		const cjsClientHooks = require(clientHooksSpecifier);

		expect(esmApi.stack).toBe(esmApi.createBackendStack);
		expect(esmClient.createStackClient).toBe(esmClient.createClientStack);
		expect(cjsApi.stack).toBe(cjsApi.createBackendStack);
		expect(cjsClient.createStackClient).toBe(cjsClient.createClientStack);
		expect(esmClient.useListState).toBeUndefined();
		expect(cjsClient.useListState).toBeUndefined();
		expect(esmClientHooks.useListState).toBeTypeOf("function");
		expect(cjsClientHooks.useListState).toBeTypeOf("function");

		await execFileAsync(
			process.execPath,
			[
				require.resolve("typescript/lib/tsc.js"),
				"--project",
				"consumer-tests/constructor-exports/tsconfig.json",
			],
			{ cwd: resolve(".") },
		);
		await execFileAsync(
			process.execPath,
			[
				require.resolve("typescript/lib/tsc.js"),
				"--project",
				"consumer-tests/constructor-exports/tsconfig.cjs.json",
			],
			{ cwd: resolve(".") },
		);
	}, 30_000);

	it("preserves prototype-like canonical IDs across public backend surfaces", async () => {
		const apiSpecifier = "@btst/stack/api";
		const pluginApiSpecifier = "@btst/stack/plugins/api";
		const authorizationSpecifier = "@btst/stack/authorization";
		const [{ createBackendStack }, pluginApi, authorization] =
			await Promise.all([
				import(apiSpecifier),
				import(pluginApiSpecifier),
				import(authorizationSpecifier),
			]);
		const permissions = authorization.definePermissions("prototype-id", {
			echo: authorization.permission(),
		});
		const echo = pluginApi.defineOperation({
			access: "public",
			input: z.object({ value: z.string() }),
			permission: permissions.echo,
			facts: () => undefined,
			execute: ({ input }: { input: { value: string } }) => input.value,
		});
		let observedContext:
			| {
					pluginRoutes: Record<string, Record<string, unknown>>;
					endpointInventory?: Array<{ pluginName: string }>;
			  }
			| undefined;
		let observedRouteOperations: Record<string, unknown> | undefined;
		const prototypePlugin = pluginApi.defineBackendPlugin({
			id: "__proto__",
			name: "legacy-name",
			dbPlugin: pluginApi.createDbPlugin("prototype-id-db", {}),
			operations: () => ({ echo }),
			infrastructureRoutes: {
				health: {
					access: "public",
					rationale: "Exercises public stack composition in the package test.",
				},
			},
			routes: (
				_adapter: unknown,
				context: typeof observedContext,
				operations: Record<string, any>,
			) => {
				observedContext = context;
				observedRouteOperations = operations;
				return {
					health: pluginApi.createEndpoint(
						"/prototype-id",
						{ method: "GET" },
						async () => ({ ok: true }),
					),
				};
			},
			api: () => ({ id: () => "__proto__" }),
		});
		const registrations: Record<string, unknown> = {
			["__proto__"]: prototypePlugin,
		};

		const stack = createBackendStack({
			plugins: registrations,
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
		});
		const requestApi = stack.forRequest(
			new Request("https://app.example.com/api"),
		).api;

		expect(Object.getPrototypeOf(stack.api)).toBeNull();
		expect(Object.hasOwn(stack.api, "__proto__")).toBe(true);
		expect(stack.api.__proto__.id()).toBe("__proto__");
		expect(Object.getPrototypeOf(stack.internal)).toBeNull();
		expect(Object.getPrototypeOf(stack.internal.__proto__)).toBeNull();
		expect(Object.getPrototypeOf(requestApi)).toBeNull();
		expect(Object.getPrototypeOf(requestApi.__proto__)).toBeNull();
		expect(Object.getPrototypeOf(observedContext?.pluginRoutes)).toBeNull();
		expect(Object.getPrototypeOf(observedRouteOperations)).toBeNull();
		expect(observedContext?.endpointInventory?.[0]?.pluginName).toBe(
			"__proto__",
		);
		expect(stack.internal.__proto__.echo).toBeTypeOf("function");
		expect(requestApi.__proto__.echo).toBeTypeOf("function");
	}, 30_000);
});
