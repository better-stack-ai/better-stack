import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DatabaseDefinition } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { definePermissions, permission } from "../../../authorization";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "../../api";
import { openApiBackendPlugin } from "../api";

describe("OpenAPI route introspection", () => {
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
				read: createEndpoint("/records/:id", { method: "GET" }, async (ctx) =>
					operations.read({ id: ctx.params.id }, ctx.request),
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
			paths: { "/records/{id}": expect.any(Object) },
		});
	});
});
