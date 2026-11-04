import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import {
	PageAIContextProvider,
	usePageAIContext,
	useRegisterPageAIContext,
} from "@btst/stack/page-context";
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

function Page() {
	useRegisterPageAIContext({
		routeName: "consumer-probe",
		pageDescription: "BTST packed core consumer",
	});
	return <main>{usePageAIContext()?.pageDescription}</main>;
}

createRoot(root).render(
	<StrictMode>
		<PageAIContextProvider>
			<StackProvider
				stack={stack}
				router={{ navigate: () => undefined }}
				overrides={{ consumerProbe: { label: "Packed" } }}
			>
				<Page />
			</StackProvider>
		</PageAIContextProvider>
	</StrictMode>,
);
