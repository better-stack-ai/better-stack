import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth } from "../authorization/server";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
	OperationHttpError,
} from "../plugins/api";
import { aiChatBackendPlugin } from "../plugins/ai-chat/api";
import { blogBackendPlugin } from "../plugins/blog/api";
import { cmsBackendPlugin } from "../plugins/cms/api";
import { commentsBackendPlugin } from "../plugins/comments/api";
import { formBuilderBackendPlugin } from "../plugins/form-builder/api";
import { kanbanBackendPlugin } from "../plugins/kanban/api";
import { mediaBackendPlugin } from "../plugins/media/api";
import type { DirectStorageAdapter } from "../plugins/media/api/storage-adapter";
import { openApiBackendPlugin } from "../plugins/open-api/api";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});
const featurePermissions = definePermissions("inventory", {
	record: {
		read: permission(z.object({ id: z.string() })),
		publicRead: permission(),
	},
});

const FIRST_PARTY_HTTP_ROUTES = {
	blog: [
		"listPosts",
		"createPost",
		"updatePost",
		"deletePost",
		"getNextPreviousPosts",
		"listTags",
	],
	comments: [
		"listComments",
		"createComment",
		"updateComment",
		"getCommentCount",
		"toggleLike",
		"updateCommentStatus",
		"deleteComment",
	],
	cms: [
		"listContentTypes",
		"getContentTypeBySlug",
		"listContentItems",
		"getContentItem",
		"createContentItem",
		"updateContentItem",
		"deleteContentItem",
		"getContentItemPopulated",
		"listContentByRelation",
		"getInverseRelations",
		"listInverseRelationItems",
	],
	formBuilder: [
		"listForms",
		"getFormBySlug",
		"getFormById",
		"getFormForUpdate",
		"createForm",
		"updateForm",
		"deleteForm",
		"submitForm",
		"listSubmissions",
		"getSubmission",
		"deleteSubmission",
	],
	kanban: [
		"listBoards",
		"getBoard",
		"createBoard",
		"updateBoard",
		"deleteBoard",
		"createColumn",
		"updateColumn",
		"deleteColumn",
		"reorderColumns",
		"createTask",
		"updateTask",
		"deleteTask",
		"moveTask",
		"reorderTasks",
	],
	media: [
		"listAssets",
		"createAsset",
		"updateAsset",
		"deleteAsset",
		"listFolders",
		"createFolder",
		"deleteFolder",
		"uploadDirect",
		"uploadToken",
		"uploadVercelBlob",
	],
	aiChat: [
		"chat",
		"listConversations",
		"getConversation",
		"createConversation",
		"updateConversation",
		"deleteConversation",
	],
	openApi: ["generateSchema", "reference"],
} as const;

function readOperation(options?: {
	access?: "authorized" | "public";
	facts?: () => { id: string } | Promise<{ id: string }>;
	execute?: () => string;
}) {
	return defineOperation({
		input: z.object({ id: z.string().min(1) }),
		permission: featurePermissions.record.read,
		...(options?.access ? { access: options.access } : {}),
		facts: options?.facts ?? (({ input }) => ({ id: input.id })),
		execute: options?.execute ?? (({ input }) => input.id),
	});
}

describe("composed endpoint inventory", () => {
	it("covers the complete maintained first-party HTTP surface", async () => {
		const storageAdapter: DirectStorageAdapter = {
			type: "local",
			upload: async (_buffer, input) => ({
				url: `https://files.example/${input.filename}`,
			}),
			delete: async () => undefined,
		};
		const backend = stack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin(),
				comments: commentsBackendPlugin(),
				cms: cmsBackendPlugin({ contentTypes: [] }),
				formBuilder: formBuilderBackendPlugin(),
				kanban: kanbanBackendPlugin(),
				media: mediaBackendPlugin({ storageAdapter }),
				aiChat: aiChatBackendPlugin({ model: {} as never }),
				openApi: openApiBackendPlugin(),
			},
			adapter: memoryAdapter,
		});
		const endpointNames = Object.keys(
			(backend.router as unknown as { endpoints: Record<string, unknown> })
				.endpoints,
		);
		const expectedEndpointNames = Object.entries(FIRST_PARTY_HTTP_ROUTES)
			.flatMap(([pluginKey, routeKeys]) =>
				routeKeys.map((routeKey) => `${pluginKey}_${routeKey}`),
			)
			.sort();
		expect(endpointNames.sort()).toEqual(expectedEndpointNames);

		const response = await backend.handler(
			new Request("http://localhost/api/open-api/schema"),
		);
		expect(response.status).toBe(200);
		const schema = (await response.json()) as {
			paths: Record<string, Record<string, { "x-btst-access"?: string }>>;
		};
		const documented = Object.values(schema.paths).flatMap((methods) =>
			Object.values(methods),
		);
		expect(documented).toHaveLength(65);
		expect(
			documented.every(
				(operation) =>
					operation["x-btst-access"] === "permission" ||
					operation["x-btst-access"] === "public",
			),
		).toBe(true);
		expect(schema.paths["/chat"]?.post).toMatchObject({
			"x-btst-access": "permission",
			"x-btst-permission": "aiChat:stream.start",
		});
		expect(schema.paths["/open-api/schema"]).toBeUndefined();
		expect(schema.paths["/reference"]).toBeUndefined();
		expect(
			(await backend.handler(new Request("http://localhost/api/api/reference")))
				.status,
		).toBe(404);
	});

	it("rejects an undeclared endpoint with its plugin, route, method, and path", () => {
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			routes: () => ({
				undeclared: createEndpoint(
					"/records",
					{ method: "POST" },
					async () => ({ ok: true }),
				),
			}),
		});

		expect(() =>
			stack({
				basePath: "/api",
				plugins: { registeredFeature: plugin },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "registeredFeature" route "undeclared" (POST /records) has no same-key operation or infrastructure declaration.',
		);
	});

	it("validates routes when an explicitly declared operation catalog is empty", () => {
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({}),
			routes: () => ({
				undeclared: createEndpoint("/records", { method: "GET" }, async () => ({
					ok: true,
				})),
			}),
		});

		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: plugin },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" route "undeclared" (GET /records) has no same-key operation or infrastructure declaration.',
		);
	});

	it("rejects endpoints missing their exact operation transport binding", async () => {
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			routes: () => ({
				read: createEndpoint("/records/:id", { method: "GET" }, async () => ({
					ok: true,
				})),
			}),
		});

		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: plugin },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" route "read" (GET /records/:id) must use an operations.read.route(ctx => input) handler.',
		);

		const mismatched = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({
				read: readOperation(),
				other: readOperation(),
			}),
			operationRouteMap: { fetch: "read" },
			routes: (_adapter, _context, operations) => ({
				fetch: createEndpoint(
					"/records/:id",
					{ method: "GET", requireRequest: true },
					operations.other.route((ctx) => ({ id: ctx.params.id })),
				),
			}),
		});
		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: mismatched },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" route "fetch" (GET /records/:id) maps to operation "read" but is bound to "feature.other".',
		);

		const protectedPlugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			routes: (_adapter, _context, operations) => ({
				read: createEndpoint(
					"/records/:id",
					{ method: "GET", requireRequest: true },
					operations.read.route((ctx) => ({ id: ctx.params.id })),
				),
			}),
		});
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [featurePermissions] as const,
			rules: () => [],
		});
		const protectedBackend = stack({
			basePath: "/api",
			plugins: { feature: protectedPlugin },
			adapter: memoryAdapter,
			auth: createServerAuth({ authorization, getIdentity: () => null }),
		});
		expect(
			(
				await protectedBackend.handler(
					new Request("http://localhost/api/records/1"),
				)
			).status,
		).toBe(401);
	});

	it("preserves exact operation execution through createEndpoint.create", async () => {
		const endpoint = createEndpoint.create();
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			routes: (_adapter, _context, operations) => ({
				read: endpoint(
					"/factory-records/:id",
					{ method: "GET", requireRequest: true },
					operations.read.route((ctx) => ({ id: ctx.params.id })),
				),
			}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
		});

		const response = await backend.handler(
			new Request("http://localhost/api/factory-records/1"),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("1");
	});

	it("maps only explicit operation HTTP errors at the generated route boundary", async () => {
		const factFailure = Object.assign(new Error("trusted fact load failed"), {
			statusCode: 418,
			code: "FACT_FAILURE_MUST_NOT_LEAK",
		});
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({
				validationFailure: defineOperation({
					input: z.object({ id: z.string().uuid() }),
					permission: featurePermissions.record.read,
					facts: ({ input }) => ({ id: input.id }),
					execute: ({ input }) => input.id,
				}),
				factFailure: readOperation({
					facts: () => {
						throw factFailure;
					},
				}),
				httpFailure: readOperation({
					execute: () => {
						throw new OperationHttpError(
							409,
							"Record changed",
							"RECORD_CHANGED",
						);
					},
				}),
			}),
			routes: (_adapter, _context, operations) => ({
				validationFailure: createEndpoint(
					"/validation-failure/:id",
					{ method: "GET", requireRequest: true },
					operations.validationFailure.route((ctx) => ({ id: ctx.params.id })),
				),
				factFailure: createEndpoint(
					"/fact-failure/:id",
					{ method: "GET", requireRequest: true },
					operations.factFailure.route((ctx) => ({ id: ctx.params.id })),
				),
				httpFailure: createEndpoint(
					"/http-failure/:id",
					{ method: "GET", requireRequest: true },
					operations.httpFailure.route((ctx) => ({ id: ctx.params.id })),
				),
			}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
		});
		const validationResponse = await backend.handler(
			new Request("http://localhost/api/validation-failure/not-a-uuid"),
		);
		expect(validationResponse.status).toBe(400);
		expect(await validationResponse.json()).toMatchObject({
			code: "VALIDATION_ERROR",
			issues: [
				{
					message: expect.any(String),
					path: ["id"],
				},
			],
		});

		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		try {
			const factResponse = await backend.handler(
				new Request("http://localhost/api/fact-failure/1"),
			);
			expect(factResponse.status).toBe(500);
			expect(await factResponse.text()).not.toContain(
				"FACT_FAILURE_MUST_NOT_LEAK",
			);
			expect(consoleError).toHaveBeenCalledWith(
				"# SERVER_ERROR: ",
				factFailure,
			);
		} finally {
			consoleError.mockRestore();
		}

		const httpResponse = await backend.handler(
			new Request("http://localhost/api/http-failure/1"),
		);
		expect(httpResponse.status).toBe(409);
		expect(await httpResponse.json()).toMatchObject({
			message: "Record changed",
			code: "RECORD_CHANGED",
		});
	});

	it("rejects stale and ambiguous infrastructure allowlist entries", () => {
		const stale = defineBackendPlugin({
			name: "docs",
			dbPlugin: createDbPlugin("docs", {}),
			infrastructureRoutes: {
				schema: {
					access: "public",
					rationale: "Serves generated documentation without application data.",
				},
				renamed: {
					access: "public",
					rationale: "This declaration must not survive a route rename.",
				},
			},
			routes: () => ({
				schema: createEndpoint("/schema", { method: "GET" }, async () => ({})),
			}),
		});
		expect(() =>
			stack({
				basePath: "/api",
				plugins: { docs: stale },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "docs" infrastructure route "renamed" has no composed endpoint.',
		);

		const ambiguous = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			infrastructureRoutes: {
				read: {
					access: "public",
					rationale: "An endpoint cannot be both business and infrastructure.",
				},
			},
			routes: (_adapter, _context, operations) => ({
				read: createEndpoint(
					"/records/:id",
					{ method: "GET", requireRequest: true },
					(ctx) => operations.read({ id: ctx.params.id }, ctx.request),
				),
			}),
		});
		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: ambiguous },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" route "read" (GET /records/:id) cannot be both operation-backed and infrastructure.',
		);
	});

	it("rejects stale or unknown route-to-operation mappings", () => {
		const unknown = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			operationRouteMap: { fetch: "missing" },
			routes: () => ({
				fetch: createEndpoint("/records/:id", { method: "GET" }, async () => ({
					ok: true,
				})),
			}),
		});
		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: unknown },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" route "fetch" maps to unknown operation "missing".',
		);

		const stale = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			operationRouteMap: { renamed: "read" },
			routes: () => ({
				read: createEndpoint("/records/:id", { method: "GET" }, async () => ({
					ok: true,
				})),
			}),
		});
		expect(() =>
			stack({
				basePath: "/api",
				plugins: { feature: stale },
				adapter: memoryAdapter,
			}),
		).toThrowError(
			'[btst/endpoint-inventory] Plugin "feature" operation route mapping "renamed" has no composed endpoint.',
		);
	});

	it("keeps route-less trusted operations out of the HTTP inventory", async () => {
		const hiddenExecute = vi.fn(() => "hidden");
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({
				read: readOperation(),
				internalOnly: readOperation({ execute: hiddenExecute }),
			}),
			routes: (_adapter, _context, operations) => ({
				read: createEndpoint(
					"/records/:id",
					{ method: "GET", requireRequest: true },
					operations.read.route((ctx) => ({ id: ctx.params.id })),
				),
			}),
		});
		const backend = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
		});

		await expect(
			backend.internal.feature.internalOnly({ id: "1" }),
		).resolves.toBe("hidden");
		expect(hiddenExecute).toHaveBeenCalledOnce();
		const endpointNames = Object.keys(
			(backend.router as unknown as { endpoints: Record<string, unknown> })
				.endpoints,
		).filter((name) => name.startsWith("feature_"));
		expect(endpointNames).toEqual(["feature_read"]);
	});
});

describe("operation access semantics", () => {
	it("preserves omitted-auth compatibility and denies a protected missing rule", async () => {
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({ read: readOperation() }),
			routes: () => ({}),
		});
		const withoutAuth = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
		});
		await expect(
			withoutAuth
				.forRequest(new Request("http://localhost/api"))
				.api.feature.read({
					id: "1",
				}),
		).resolves.toBe("1");

		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [featurePermissions] as const,
			rules: () => [],
		});
		const withAuth = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
			auth: createServerAuth({
				authorization,
				getIdentity: () => null,
			}),
		});
		await expect(
			withAuth
				.forRequest(new Request("http://localhost/api"))
				.api.feature.read({
					id: "1",
				}),
		).rejects.toMatchObject({ name: "AuthorizationError", statusCode: 401 });

		const identified = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
			auth: createServerAuth({
				authorization,
				getIdentity: () => ({ id: "user-1" }),
			}),
		});
		await expect(
			identified
				.forRequest(new Request("http://localhost/api"))
				.api.feature.read({ id: "1" }),
		).rejects.toMatchObject({ name: "AuthorizationError", statusCode: 403 });
	});

	it("lets only explicit public operations bypass identity while retaining validation and fact errors", async () => {
		const identity = vi.fn(() => {
			throw new Error("identity must not run");
		});
		const factFailure = new Error("trusted fact load failed");
		const plugin = defineBackendPlugin({
			name: "feature",
			dbPlugin: createDbPlugin("feature", {}),
			operations: () => ({
				publicRead: readOperation({ access: "public" }),
				brokenPublicRead: readOperation({
					access: "public",
					facts: async () => {
						throw factFailure;
					},
				}),
			}),
			routes: () => ({}),
		});
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [featurePermissions] as const,
			rules: ({ inventory }) => [inventory.record.read.allow()],
		});
		const backend = stack({
			basePath: "/api",
			plugins: { feature: plugin },
			adapter: memoryAdapter,
			auth: createServerAuth({ authorization, getIdentity: identity }),
		});
		const api = backend.forRequest(new Request("http://localhost/api")).api
			.feature;

		await expect(api.publicRead({ id: "1" })).resolves.toBe("1");
		expect(identity).not.toHaveBeenCalled();
		await expect(api.publicRead({ id: "" })).rejects.toBeInstanceOf(z.ZodError);
		await expect(api.brokenPublicRead({ id: "1" })).rejects.toBe(factFailure);
	});
});
