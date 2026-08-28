import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createBackendStack } from "../api";
import { createClientStack } from "../client";
import { StackProvider, usePluginOverrides, useStack } from "../context";
import { createDbPlugin, defineBackendPlugin } from "../plugins/api";
import { createRoute, defineClientPlugin } from "../plugins/client";
import { generateRouteDocsSchema } from "../plugins/route-docs/generator";

function runtimeConfig<TPlugins extends Record<string, any>>(
	plugins: TPlugins,
) {
	return {
		api: { baseURL: "https://app.example.com", basePath: "/api/data" },
		site: { baseURL: "https://app.example.com", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins,
	};
}

function identifiedClient(id: string) {
	return defineClientPlugin({
		id,
		resolve: (runtime) => ({
			routes: () => ({
				probe: createRoute(`/${id}`, () => ({ PageComponent: () => null })),
			}),
			sitemap: () => [
				{ url: `${runtime.site.baseURL}${runtime.site.basePath}/${id}` },
			],
		}),
	});
}

function identifiedBackend(id: string) {
	return defineBackendPlugin({
		id,
		dbPlugin: createDbPlugin(`${id}-db`, {}),
		routes: () => ({}),
	});
}

describe("canonical plugin registration IDs", () => {
	it("rejects client aliases and duplicate resolved IDs before resolution", () => {
		expect(() =>
			createClientStack(
				runtimeConfig({ alias: identifiedClient("actual") }) as any,
			),
		).toThrowError(/client.*key.*alias.*ID.*actual/i);

		expect(() =>
			createClientStack(
				runtimeConfig({
					first: identifiedClient("duplicate"),
					second: identifiedClient("duplicate"),
				}) as any,
			),
		).toThrowError(/client.*ID.*duplicate.*first.*second/i);
	});

	it("requires plugins to be an own client configuration property", () => {
		const inheritedConfig = Object.assign(
			Object.create({ plugins: { probe: identifiedClient("probe") } }),
			{
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient: new QueryClient(),
			},
		);

		expect(() => createClientStack(inheritedConfig as any)).toThrowError(
			/plugins.*registration map/i,
		);
	});

	it("rejects backend aliases and duplicate resolved IDs before adapter creation", () => {
		const adapter = vi.fn(() => createMemoryAdapter(defineDb({}))({}));
		expect(() =>
			createBackendStack({
				basePath: "/api/data",
				plugins: { alias: identifiedBackend("actual") },
				adapter,
			} as any),
		).toThrowError(/backend.*key.*alias.*ID.*actual/i);
		expect(adapter).not.toHaveBeenCalled();

		expect(() =>
			createBackendStack({
				basePath: "/api/data",
				plugins: {
					first: identifiedBackend("duplicate"),
					second: identifiedBackend("duplicate"),
				},
				adapter,
			} as any),
		).toThrowError(/backend.*ID.*duplicate.*first.*second/i);
		expect(adapter).not.toHaveBeenCalled();
	});

	it("binds provider runtime and overrides to the resolved client stack", async () => {
		const plugin = defineClientPlugin<{ label: string }>()({
			id: "probe",
			resolve: (runtime) => ({
				routes: () => ({
					probe: createRoute("/probe", () => ({ PageComponent: () => null })),
				}),
				sitemap: () => [
					{ url: `${runtime.site.baseURL}${runtime.site.basePath}/probe` },
				],
			}),
		});
		const stack = createClientStack({
			...runtimeConfig({ probe: plugin }),
			endpoints: { probe: { api: { basePath: "/api/probe" } } },
		});
		let observed:
			| {
					basePath: string;
					apiBasePath?: string;
					pluginBasePath?: string;
					label: string;
			  }
			| undefined;

		function Probe() {
			const context = useStack();
			const overrides = usePluginOverrides<{ label: string }>("probe");
			observed = {
				basePath: context.basePath,
				apiBasePath: context.api?.basePath,
				pluginBasePath: context.plugins?.probe?.api.basePath,
				label: overrides.label,
			};
			return null;
		}

		renderToString(
			<StackProvider stack={stack} overrides={{ probe: { label: "Resolved" } }}>
				<Probe />
			</StackProvider>,
		);

		expect(observed).toEqual({
			basePath: "/pages",
			apiBasePath: "/api/data",
			pluginBasePath: "/api/probe",
			label: "Resolved",
		});
		await expect(stack.generateSitemap()).resolves.toEqual([
			{ url: "https://app.example.com/pages/probe" },
		]);
	});

	it("uses a canonical ID instead of a conflicting legacy name in client diagnostics", () => {
		let contextPluginName: string | undefined;
		const canonicalDefinition = defineClientPlugin({
			id: "canonical",
			name: "legacy-name",
			resolve: () => ({
				routes: (context) => {
					contextPluginName = context?.plugins.canonical?.name;
					return {
						canonical: createRoute("/canonical", () => ({
							PageComponent: () => null,
						})),
					};
				},
			}),
		});

		createClientStack(runtimeConfig({ canonical: canonicalDefinition }));

		expect(contextPluginName).toBe("canonical");
		const schema = generateRouteDocsSchema({
			plugins: {
				canonical: defineClientPlugin({
					id: "canonical",
					name: "legacy-name",
					routes: () => ({
						canonical: createRoute("/canonical", () => ({
							PageComponent: () => null,
						})),
					}),
				}),
			},
		});
		expect(schema.plugins).toMatchObject([
			{ key: "canonical", name: "canonical" },
		]);
	});
});
