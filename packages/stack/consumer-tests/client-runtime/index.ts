import { QueryClient } from "@tanstack/react-query";
import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import {
	createClientStack,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/client";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "@btst/stack/plugins/api";

export interface ConsumerProbeOverrides {
	label: string;
	format?: "short" | "long";
}

const observations: ResolvedClientPluginRuntime[] = [];
const probeClientPlugin = () =>
	defineClientPlugin<ConsumerProbeOverrides>()({
		id: "consumerProbe",
		resolve(runtime) {
			runtime.id satisfies "consumerProbe";
			observations.push(runtime);
			return {
				routes: () => ({
					probe: createRoute("/probe", () => ({
						PageComponent: () => null,
						loader: async () => {
							await runtime.queryClient.prefetchQuery({
								queryKey: ["consumer-probe"],
								queryFn: async () =>
									`${runtime.api.baseURL}${runtime.api.basePath}`,
							});
						},
						meta: () => [
							{
								name: "consumer-probe-site",
								content: `${runtime.site.baseURL}${runtime.site.basePath}`,
							},
						],
					})),
				}),
				sitemap: () => [
					{
						url: `${runtime.site.baseURL}${runtime.site.basePath}/probe`,
					},
				],
			};
		},
	});

probeClientPlugin().id satisfies "consumerProbe";

const queryClient = new QueryClient();
const clientStack = createClientStack({
	api: {
		baseURL: "https://app.example.com",
		basePath: "/api/data",
		headers: { cookie: "request=session" },
	},
	site: {
		baseURL: "https://app.example.com",
		basePath: "/pages",
	},
	queryClient,
	plugins: {
		consumerProbe: probeClientPlugin(),
	},
	endpoints: {
		consumerProbe: {
			api: {
				basePath: "/api/probe",
				browserHeaders: { "x-browser-safe": "public" },
			},
		},
	},
});

export const browserClientStack = createClientStack({
	api: {
		baseURL: "https://app.example.com",
		basePath: "/api/data",
	},
	site: {
		baseURL: "https://app.example.com",
		basePath: "/pages",
	},
	queryClient: new QueryClient(),
	plugins: {
		consumerProbe: probeClientPlugin(),
	},
	endpoints: {
		consumerProbe: {
			api: {
				basePath: "/api/probe",
				browserHeaders: { "x-browser-safe": "public" },
			},
		},
	},
});

clientStack.provider.queryClient satisfies QueryClient;
clientStack.provider.plugins.consumerProbe.id satisfies "consumerProbe";
clientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.queryClient satisfies QueryClient;
browserClientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.plugins.consumerProbe.api.browserHeaders satisfies
	| Headers
	| undefined;
observations[0]?.api.headers satisfies Headers | undefined;
observations[0]?.id satisfies string | undefined;
// @ts-expect-error Request headers do not exist on the top-level provider projection.
clientStack.provider.api.headers;

createClientStack({
	// @ts-expect-error Shared origins must be qualified under api or site.
	baseURL: "https://ignored.example.com",
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
});

createClientStack({
	// @ts-expect-error Shared paths must be qualified under api or site.
	basePath: "/ignored",
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
	endpoints: {
		consumerProbe: {
			// @ts-expect-error A replacement origin requires its own basePath.
			api: { baseURL: "https://plugins.example.net" },
		},
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration aliases cannot diverge from a canonical ID.
		alias: probeClientPlugin(),
	},
});

const probeBackendPlugin = () =>
	defineBackendPlugin({
		id: "consumerProbe",
		dbPlugin: createDbPlugin("consumer-probe", {}),
		routes: () => ({
			probe: createEndpoint("/probe", { method: "GET" }, async () => ({
				ok: true,
			})),
		}),
	});

probeBackendPlugin().id satisfies "consumerProbe";

createBackendStack({
	basePath: "/api/data",
	plugins: { consumerProbe: probeBackendPlugin() },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});

createBackendStack({
	basePath: "/api/data",
	plugins: {
		// @ts-expect-error Backend registration aliases cannot diverge from a canonical ID.
		alias: probeBackendPlugin(),
	},
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { consumerProbe: probeClientPlugin() },
	endpoints: {
		// @ts-expect-error Replacements are limited to registered plugin keys.
		missing: { api: { basePath: "/api/missing" } },
	},
});
