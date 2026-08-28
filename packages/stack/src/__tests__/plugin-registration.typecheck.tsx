import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { createBackendStack } from "../api";
import { createClientStack } from "../client";
import { StackProvider } from "../context";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "../plugins/api";
import { createRoute, defineClientPlugin } from "../plugins/client";

interface ConsumerOverrides {
	label: string;
	format?: "short" | "long";
}

function consumerClientPlugin() {
	return defineClientPlugin<ConsumerOverrides>()({
		id: "consumerProbe",
		resolve: () => ({
			routes: () => ({
				consumerProbe: createRoute("/consumer-probe", () => ({
					PageComponent: () => null,
				})),
			}),
		}),
	});
}

function routeOnlyClientPlugin() {
	return defineClientPlugin({
		id: "routeOnly",
		resolve: () => ({
			routes: () => ({
				routeOnly: createRoute("/route-only", () => ({
					PageComponent: () => null,
				})),
			}),
		}),
	});
}

consumerClientPlugin().id satisfies "consumerProbe";
routeOnlyClientPlugin().id satisfies "routeOnly";

const queryClient = new QueryClient();
const clientStack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		consumerProbe: consumerClientPlugin(),
		routeOnly: routeOnlyClientPlugin(),
	},
});

const routeOnlyStack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { routeOnly: routeOnlyClientPlugin() },
});

<StackProvider
	stack={clientStack}
	router={{ navigate: () => undefined }}
	overrides={{
		consumerProbe: { label: "Probe", format: "short" },
	}}
/>;

<StackProvider stack={clientStack} />;

<StackProvider stack={routeOnlyStack} />;

// @ts-expect-error No-override stacks do not accept activation-style empty blocks.
<StackProvider stack={routeOnlyStack} overrides={{ routeOnly: {} }} />;

// @ts-expect-error Override values are inferred from the registered definition.
<StackProvider
	stack={clientStack}
	overrides={{
		consumerProbe: {
			label: "Probe",
			format: "wide",
		},
	}}
/>;

// @ts-expect-error Plugins without configurable fields are absent from overrides.
<StackProvider
	stack={clientStack}
	overrides={{
		routeOnly: {},
	}}
/>;

// @ts-expect-error Canonical providers consume API/site paths from the resolved stack.
<StackProvider stack={clientStack} basePath="/other-pages" />;

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration keys must equal a canonical client plugin ID.
		alias: consumerClientPlugin(),
	},
});

function consumerBackendPlugin() {
	return defineBackendPlugin({
		id: "consumerProbe",
		dbPlugin: createDbPlugin("consumer-probe-db", {}),
		routes: () => ({
			probe: createEndpoint("/probe", { method: "GET" }, async () => ({
				ok: true,
			})),
		}),
	});
}

consumerBackendPlugin().id satisfies "consumerProbe";

createBackendStack({
	basePath: "/api/data",
	plugins: { consumerProbe: consumerBackendPlugin() },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});

createBackendStack({
	basePath: "/api/data",
	plugins: {
		// @ts-expect-error Registration keys must equal a canonical backend plugin ID.
		alias: consumerBackendPlugin(),
	},
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});
