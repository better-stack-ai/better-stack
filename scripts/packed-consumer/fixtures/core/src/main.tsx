import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const consumerPlugin = () =>
	defineClientPlugin<{ label: string }>()({
		id: "consumerProbe",
		resolve: () => ({
			routes: () => ({
				probe: createRoute("/probe", () => ({
					PageComponent: () => <main>packed consumer</main>,
				})),
			}),
		}),
	});

const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api/data" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: { consumerProbe: consumerPlugin() },
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
	<StrictMode>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			overrides={{ consumerProbe: { label: "Packed" } }}
		>
			<main>BTST packed core consumer</main>
		</StackProvider>
	</StrictMode>,
);
