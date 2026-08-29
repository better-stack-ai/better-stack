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

describe("published canonical stack constructors", () => {
	it("exposes only canonical names through ESM, CJS, declarations and typesVersions", async () => {
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
			expect(declaration).toContain("BackendStackConfig");
			expect(declaration).toContain("BackendStack<");
			expect(declaration).not.toContain("const stack:");
			expect(declaration).not.toContain("BackendLib");
		}
		for (const declaration of [clientDeclaration, clientCjsDeclaration]) {
			expect(declaration).toContain("function createClientStack");
			expect(declaration).toContain("ClientStackConfig");
			expect(declaration).toContain("ClientStack<");
			expect(declaration).not.toContain("createStackClient");
			expect(declaration).not.toContain("ClientLib");
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

		expect(esmApi.createBackendStack).toBeTypeOf("function");
		expect(esmClient.createClientStack).toBeTypeOf("function");
		expect(cjsApi.createBackendStack).toBeTypeOf("function");
		expect(cjsClient.createClientStack).toBeTypeOf("function");
		expect("stack" in esmApi).toBe(false);
		expect("createStackClient" in esmClient).toBe(false);
		expect("stack" in cjsApi).toBe(false);
		expect("createStackClient" in cjsClient).toBe(false);
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
			raw: () => ({ id: () => "__proto__" }),
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
		).operations;

		expect(Object.getPrototypeOf(stack.raw)).toBeNull();
		expect(Object.hasOwn(stack.raw, "__proto__")).toBe(true);
		expect(stack.raw.__proto__.id()).toBe("__proto__");
		expect(Object.getPrototypeOf(stack.trusted)).toBeNull();
		expect(Object.getPrototypeOf(stack.trusted.__proto__)).toBeNull();
		expect(Object.getPrototypeOf(requestApi)).toBeNull();
		expect(Object.getPrototypeOf(requestApi.__proto__)).toBeNull();
		expect(Object.getPrototypeOf(observedContext?.pluginRoutes)).toBeNull();
		expect(Object.getPrototypeOf(observedRouteOperations)).toBeNull();
		expect(observedContext?.endpointInventory?.[0]?.pluginName).toBe(
			"__proto__",
		);
		expect(stack.trusted.__proto__.echo).toBeTypeOf("function");
		expect(requestApi.__proto__.echo).toBeTypeOf("function");
	}, 30_000);
});

describe("published backend plugin factories", () => {
	it("preserves all eight factory contracts through ESM, CJS and declarations", async () => {
		const storageAdapter = {
			type: "local" as const,
			upload: async (_buffer: Buffer, { filename }: { filename: string }) => ({
				url: `https://files.example/${filename}`,
			}),
			delete: async () => undefined,
		};
		const factories = [
			{
				specifier: "@btst/stack/plugins/ai-chat/api",
				exportName: "aiChatBackendPlugin",
				id: "aiChat",
				args: [{ model: {} }],
			},
			{
				specifier: "@btst/stack/plugins/blog/api",
				exportName: "blogBackendPlugin",
				id: "blog",
				args: [],
			},
			{
				specifier: "@btst/stack/plugins/cms/api",
				exportName: "cmsBackendPlugin",
				id: "cms",
				args: [{ contentTypes: [] }],
			},
			{
				specifier: "@btst/stack/plugins/comments/api",
				exportName: "commentsBackendPlugin",
				id: "comments",
				args: [],
			},
			{
				specifier: "@btst/stack/plugins/form-builder/api",
				exportName: "formBuilderBackendPlugin",
				id: "formBuilder",
				args: [],
			},
			{
				specifier: "@btst/stack/plugins/kanban/api",
				exportName: "kanbanBackendPlugin",
				id: "kanban",
				args: [],
			},
			{
				specifier: "@btst/stack/plugins/media/api",
				exportName: "mediaBackendPlugin",
				id: "media",
				args: [{ storageAdapter }],
			},
			{
				specifier: "@btst/stack/plugins/open-api/api",
				exportName: "openApiBackendPlugin",
				id: "openApi",
				args: [],
			},
		] as const;
		const require = createRequire(import.meta.url);

		for (const factory of factories) {
			const esm = (await import(factory.specifier)) as Record<
				string,
				(...args: any[]) => { id: string }
			>;
			const cjs = require(factory.specifier) as Record<
				string,
				(...args: any[]) => { id: string }
			>;
			expect(esm[factory.exportName]?.(...factory.args).id).toBe(factory.id);
			expect(cjs[factory.exportName]?.(...factory.args).id).toBe(factory.id);
		}

		for (const project of [
			"consumer-tests/backend-factories/tsconfig.json",
			"consumer-tests/backend-factories/tsconfig.cjs.json",
		]) {
			await execFileAsync(
				process.execPath,
				[require.resolve("typescript/lib/tsc.js"), "--project", project],
				{ cwd: resolve(".") },
			);
		}
	}, 30_000);
});
