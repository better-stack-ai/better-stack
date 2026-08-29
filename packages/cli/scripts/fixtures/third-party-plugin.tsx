import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "@btst/stack/plugins/api";
import { defineClientPlugin, defineRoute } from "@btst/stack/plugins/client";
import { QueryClient } from "@tanstack/react-query";

interface ThirdPartyProbeOverrides {
	label: string;
}

const thirdPartyProbeBackendPlugin = defineBackendPlugin({
	id: "thirdPartyProbe",
	dbPlugin: createDbPlugin("third-party-probe", {}),
	routes: () => ({
		ping: createEndpoint("/ping", { method: "GET" }, async () => ({
			ok: true,
		})),
	}),
});

const thirdPartyProbeClientPlugin =
	defineClientPlugin<ThirdPartyProbeOverrides>()({
		id: "thirdPartyProbe",
		resolve: () => ({
			routes: () => ({
				probe: defineRoute("/third-party-probe", { page: () => null }),
			}),
		}),
	});

export const thirdPartyBackendStack = createBackendStack({
	basePath: "/api/data",
	plugins: { thirdPartyProbe: thirdPartyProbeBackendPlugin },
	adapter: (db) => createMemoryAdapter(db)({}),
});

const queryClient = new QueryClient();
const thirdPartyClientStack = createClientStack({
	api: { baseURL: "http://localhost:3000", basePath: "/api/data" },
	site: { baseURL: "http://localhost:3000", basePath: "/pages" },
	queryClient,
	plugins: { thirdPartyProbe: thirdPartyProbeClientPlugin },
});

export function ThirdPartyPluginFixture() {
	return (
		<StackProvider
			stack={thirdPartyClientStack}
			overrides={{ thirdPartyProbe: { label: "Third-party probe" } }}
		/>
	);
}
