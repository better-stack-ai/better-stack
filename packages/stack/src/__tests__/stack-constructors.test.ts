import { createMemoryAdapter } from "@btst/adapter-memory";
import { createDbPlugin, type DatabaseDefinition } from "@btst/db";
import { createRoute } from "@btst/yar";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createBackendStack, stack } from "../api";
import { definePermissions, permission } from "../authorization";
import { createClientStack, createStackClient } from "../client";
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
	name: "probe",
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
	name: "probe",
	routes: () => ({
		probe: createRoute("/probe", () => ({
			PageComponent: () => null,
		})),
	}),
	sitemap: () => [{ url: "https://example.com/probe" }],
});

describe("symmetric stack constructors", () => {
	it("keeps the legacy constructor names as exact forwarding aliases", () => {
		expect(stack).toBe(createBackendStack);
		expect(createStackClient).toBe(createClientStack);
	});

	for (const [name, factory] of [
		["canonical", createBackendStack],
		["temporary alias", stack],
	] as const) {
		it(`preserves backend routes and operation surfaces through the ${name} name`, async () => {
			const backend = factory({
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
				backend.internal.probe.echo({ value: "internal" }),
			).resolves.toEqual({ value: "internal" });
			await expect(
				backend
					.forRequest(new Request("https://example.com/api"))
					.api.probe.echo({ value: "request" }),
			).resolves.toEqual({ value: "request" });

			const response = await backend.handler(
				new Request("https://example.com/api/echo/handler"),
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ value: "handler" });
		});
	}

	for (const [name, factory] of [
		["canonical", createClientStack],
		["temporary alias", createStackClient],
	] as const) {
		it(`preserves client routes and sitemap behavior through the ${name} name`, async () => {
			const client = factory({ plugins: { probe: clientPlugin } });

			expect(typeof client.router.getRoute("/probe")?.PageComponent).toBe(
				"function",
			);
			await expect(client.generateSitemap()).resolves.toEqual([
				{ url: "https://example.com/probe" },
			]);
		});
	}
});
