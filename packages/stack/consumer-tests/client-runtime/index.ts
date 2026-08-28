import { QueryClient } from "@tanstack/react-query";
import {
	createClientStack,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/client";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";

const observations: ResolvedClientPluginRuntime[] = [];
const probeClientPlugin = () =>
	defineClientPlugin({
		name: "consumerProbe",
		resolve(runtime) {
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

const browserClientStack = createClientStack({
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
clientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.queryClient satisfies QueryClient;
browserClientStack.provider.plugins.consumerProbe.api.basePath satisfies string;
browserClientStack.provider.plugins.consumerProbe.api.browserHeaders satisfies
	| Headers
	| undefined;
observations[0]?.api.headers satisfies Headers | undefined;
// @ts-expect-error Request headers do not exist on the top-level provider projection.
clientStack.provider.api.headers;

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
	plugins: { consumerProbe: probeClientPlugin() },
	endpoints: {
		// @ts-expect-error Replacements are limited to registered plugin keys.
		missing: { api: { basePath: "/api/missing" } },
	},
});
