import { createMemoryAdapter } from "@btst/adapter-memory";
import { createDbPlugin, type DatabaseDefinition } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { createRoute } from "@btst/yar";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../api";
import { definePermissions, permission } from "../authorization";
import { createClientStack } from "../client";
import {
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "../plugins/api";
import { defineClientPlugin } from "../plugins/client";

const adapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});
const probePermissions = definePermissions("probe", {
	echo: permission(z.object({ value: z.string() })),
});
const probeOperation = defineOperation({
	access: "public",
	input: z.object({ value: z.string() }),
	permission: probePermissions.echo,
	facts: ({ input }) => ({ value: input.value }),
	execute: ({ input }) => ({ value: input.value }),
});
const backendPlugin = defineBackendPlugin({
	id: "probe",
	dbPlugin: createDbPlugin("probe", {}),
	operations: () => ({ echo: probeOperation }),
	routes: (_adapter, _context, operations) => ({
		echo: createEndpoint(
			"/echo/:value",
			{ method: "GET", requireRequest: true },
			operations.echo.route((context) => ({ value: context.params.value })),
		),
	}),
});
const clientPlugin = defineClientPlugin({
	id: "probe",
	resolve: () => ({
		routes: () => ({
			probe: createRoute("/probe", () => ({
				PageComponent: () => null,
			})),
		}),
		sitemap: () => [{ url: "https://example.com/probe" }],
	}),
});

describe("canonical stack constructors", () => {
	it("preserves backend routes and operation surfaces", async () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { probe: backendPlugin },
			adapter,
		});

		const endpointNames = Object.keys(
			(backend.router as unknown as { endpoints: Record<string, unknown> })
				.endpoints,
		);
		expect(endpointNames).toContain("probe_echo");
		await expect(
			backend.trusted.probe.echo({ value: "trusted" }),
		).resolves.toEqual({ value: "trusted" });
		await expect(
			backend
				.forRequest(new Request("https://example.com/api"))
				.operations.probe.echo({ value: "request" }),
		).resolves.toEqual({ value: "request" });

		const response = await backend.handler(
			new Request("https://example.com/api/echo/handler"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ value: "handler" });
	});

	it("preserves client routes and sitemap behavior", async () => {
		const client = createClientStack({
			api: { baseURL: "https://example.com", basePath: "/api" },
			site: { baseURL: "https://example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { probe: clientPlugin },
		});

		expect(typeof client.router.getRoute("/probe")?.PageComponent).toBe(
			"function",
		);
		await expect(client.generateSitemap()).resolves.toEqual([
			{ url: "https://example.com/probe" },
		]);
	});
});
