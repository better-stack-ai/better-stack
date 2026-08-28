import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "../../api";
import { openApiBackendPlugin } from "../api";

describe("OpenAPI route introspection", () => {
	it("declares the schema and reference handlers as the exact public infrastructure allowlist", () => {
		const plugin = openApiBackendPlugin();
		expect(plugin.infrastructureRoutes).toEqual({
			generateSchema: {
				access: "public",
				rationale:
					"Serves deterministic API metadata and does not execute an application business operation.",
			},
			reference: {
				access: "public",
				rationale:
					"Serves the documentation UI for the same public schema without executing an application business operation.",
			},
		});
	});

	it("reuses constructed routes instead of forging an operation transport", async () => {
		const permissions = definePermissions("introspection", {
			read: permission(),
		});
		const read = defineOperation({
			input: z.object({ id: z.string() }),
			permission: permissions.read,
			facts: () => undefined,
			execute: ({ input }) => input.id,
		});
		const routes = vi.fn((_adapter, _context, operations) => {
			if (typeof operations.read !== "function") {
				throw new Error("bound operation is required");
			}
			return {
				read: operations.read.route(
					createEndpoint("/records/:id", { method: "GET" }, async (ctx) =>
						operations.read({ id: ctx.params.id }, ctx.request),
					),
				),
			};
		});
		const feature = defineBackendPlugin({
			name: "introspection",
			dbPlugin: createDbPlugin("introspection", {}),
			operations: () => ({ read }),
			routes,
		});
		const backend = stack({
			basePath: "/api",
			plugins: {
				openApi: openApiBackendPlugin(),
				feature,
			},
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
		});

		expect(routes).toHaveBeenCalledTimes(1);
		const response = await backend.handler(
			new Request("http://localhost/api/open-api/schema"),
		);

		expect(response.status).toBe(200);
		expect(routes).toHaveBeenCalledTimes(1);
		await expect(response.json()).resolves.toMatchObject({
			openapi: "3.1.0",
			paths: {
				"/records/{id}": {
					get: {
						"x-btst-access": "permission",
						"x-btst-permission": "introspection:read",
					},
				},
			},
		});
	});

	it("keeps schema and reference explicitly public without resolving identity", async () => {
		const permissions = definePermissions("documented", {
			read: permission(),
		});
		const read = defineOperation({
			input: z.object({}),
			permission: permissions.read,
			facts: () => undefined,
			execute: () => ({ ok: true as const }),
		});
		const feature = defineBackendPlugin({
			name: "documented",
			dbPlugin: createDbPlugin("documented", {}),
			operations: () => ({ read }),
			routes: (_adapter, _context, operations) => ({
				read: operations.read.route(
					createEndpoint(
						"/documented",
						{ method: "GET", requireRequest: true },
						(ctx) => operations.read({}, ctx.request),
					),
				),
			}),
		});
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [permissions] as const,
			rules: ({ documented }) => [documented.read.allow()],
		});
		const getIdentity = vi.fn(() => {
			throw new Error("public infrastructure must not resolve identity");
		});
		const backend = stack({
			basePath: "/api",
			plugins: { openApi: openApiBackendPlugin(), feature },
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
			auth: createServerAuth({ authorization, getIdentity }),
		});

		const schema = await backend.handler(
			new Request("http://localhost/api/open-api/schema"),
		);
		const reference = await backend.handler(
			new Request("http://localhost/api/reference"),
		);
		expect(schema.status).toBe(200);
		expect(reference.status).toBe(200);
		expect(reference.headers.get("content-type")).toContain("text/html");
		expect(getIdentity).not.toHaveBeenCalled();

		const disabled = stack({
			basePath: "/api",
			plugins: {
				openApi: openApiBackendPlugin({ disableDefaultReference: true }),
				feature,
			},
			adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
		});
		expect(
			(await disabled.handler(new Request("http://localhost/api/reference")))
				.status,
		).toBe(404);
	});

	it("emits deterministic safe access metadata without exposing internal operations or rule inputs", async () => {
		const permissions = definePermissions("metadata", {
			read: permission(z.object({ authoritativeSecret: z.string() })),
			publicRead: permission(),
			internalOnly: permission(),
		});
		const protectedRead = defineOperation({
			input: z.object({ id: z.string() }),
			permission: permissions.read,
			facts: () => ({ authoritativeSecret: "server-only" }),
			execute: ({ input }) => input.id,
		});
		const publicRead = defineOperation({
			input: z.object({}),
			permission: permissions.publicRead,
			access: "public",
			facts: () => undefined,
			execute: () => ({ ok: true as const }),
		});
		const internalOnly = defineOperation({
			input: z.object({}),
			permission: permissions.internalOnly,
			facts: () => undefined,
			execute: () => "internal",
		});
		const feature = defineBackendPlugin({
			name: "metadata",
			dbPlugin: createDbPlugin("metadata", {}),
			operations: () => ({ protectedRead, publicRead, internalOnly }),
			routes: (_adapter, _context, operations) => ({
				protectedRead: operations.protectedRead.route(
					createEndpoint(
						"/z-protected/:id",
						{ method: "GET", requireRequest: true },
						(ctx) => operations.protectedRead(ctx.params, ctx.request),
					),
				),
				publicRead: operations.publicRead.route(
					createEndpoint(
						"/a-public",
						{ method: "GET", requireRequest: true },
						(ctx) => operations.publicRead({}, ctx.request),
					),
				),
			}),
		});
		const build = (plugins: Record<string, any>) =>
			stack({
				basePath: "/api",
				plugins,
				adapter: (db: DatabaseDefinition) => createMemoryAdapter(db)({}),
			});
		const first = build({ openApi: openApiBackendPlugin(), feature });
		const second = build({ feature, openApi: openApiBackendPlugin() });
		const readSchema = async (backend: typeof first) => {
			const response = await backend.handler(
				new Request("http://localhost/api/open-api/schema"),
			);
			expect(response.status).toBe(200);
			return response.json();
		};
		const firstSchema = await readSchema(first);
		const secondSchema = await readSchema(second);

		expect(firstSchema).toEqual(secondSchema);
		expect(firstSchema.paths).toEqual({
			"/a-public": {
				get: expect.objectContaining({
					operationId: "feature_publicRead",
					"x-btst-access": "public",
				}),
			},
			"/z-protected/{id}": {
				get: expect.objectContaining({
					operationId: "feature_protectedRead",
					"x-btst-access": "permission",
					"x-btst-permission": "metadata:read",
				}),
			},
		});
		expect(
			Object.fromEntries(
				Object.entries(firstSchema.paths).map(([path, methods]) => [
					path,
					Object.fromEntries(
						Object.entries(methods as Record<string, any>).map(
							([method, operation]) => [
								method,
								{
									operationId: operation.operationId,
									access: operation["x-btst-access"],
									permission: operation["x-btst-permission"],
								},
							],
						),
					),
				]),
			),
		).toMatchInlineSnapshot(`
			{
			  "/a-public": {
			    "get": {
			      "access": "public",
			      "operationId": "feature_publicRead",
			      "permission": undefined,
			    },
			  },
			  "/z-protected/{id}": {
			    "get": {
			      "access": "permission",
			      "operationId": "feature_protectedRead",
			      "permission": "metadata:read",
			    },
			  },
			}
		`);
		const serialized = JSON.stringify(firstSchema);
		expect(serialized).not.toContain("internalOnly");
		expect(serialized).not.toContain("authoritativeSecret");
		expect(serialized).not.toContain("server-only");
		expect(serialized).not.toContain("rules");
	});
});
