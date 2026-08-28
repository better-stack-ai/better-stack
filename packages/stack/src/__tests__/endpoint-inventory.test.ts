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
		).filter((name) => name !== "openapi");
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
					(ctx) => operations.read({ id: ctx.params.id }, ctx.request),
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
