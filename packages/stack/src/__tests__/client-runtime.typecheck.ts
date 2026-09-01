import { QueryClient } from "@tanstack/react-query";
import { createRoute } from "@btst/yar";
import { createClientStack } from "../client";
import { defineClientPlugin } from "../plugins/client";

const probe = defineClientPlugin({
	id: "probe",
	resolve: (runtime) => ({
		routes: () => ({
			probe: createRoute("/probe", () => ({
				PageComponent: () => null,
				loader: () => {
					runtime.queryClient.setQueryData(["probe"], runtime.api.basePath);
				},
				meta: () => [
					{
						name: "site",
						content: `${runtime.site.baseURL}${runtime.site.basePath}`,
					},
				],
			})),
		}),
	}),
});

const queryClient = new QueryClient();

const canonical = createClientStack({
	api: {
		baseURL: "https://app.example.com",
		basePath: "/api/data",
		headers: { cookie: "session=request" },
	},
	site: {
		baseURL: "https://app.example.com",
		basePath: "/pages",
	},
	queryClient,
	plugins: { probe },
	endpoints: {
		probe: {
			api: { basePath: "/api/probe" },
			site: {
				baseURL: "https://pages.example.net",
				basePath: "/features",
			},
		},
	},
});

canonical.provider.queryClient satisfies QueryClient;
canonical.provider.api.baseURL satisfies string;
canonical.provider.plugins.probe.site.basePath satisfies string;
// @ts-expect-error Server request headers are not part of the provider projection.
canonical.provider.api.headers;

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { probe },
	endpoints: {
		probe: {
			api: {
				basePath: "/api/probe",
				// @ts-expect-error Provider-visible headers must use the explicit browserHeaders field.
				headers: { "x-public": "value" },
			},
		},
	},
});

// @ts-expect-error Runtime-independent definitions require the canonical runtime.
createClientStack({ plugins: { probe } });

// @ts-expect-error Canonical runtime requires a site location.
createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	queryClient,
	plugins: { probe },
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { probe },
	endpoints: {
		probe: {
			// @ts-expect-error Replacing the API origin also requires an explicit basePath.
			api: {
				baseURL: "https://plugins.example.net",
			},
		},
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { probe },
	endpoints: {
		// @ts-expect-error Endpoint replacements are limited to registered plugin keys.
		missing: { api: { basePath: "/api/missing" } },
	},
});
