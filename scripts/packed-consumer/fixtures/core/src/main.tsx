import { createClientStack } from "@btst/stack/client";
import { StackProvider, usePluginOverrides } from "@btst/stack/context";
import {
	PageAIContextProvider,
	usePageAIContext,
	useRegisterPageAIContext,
} from "@btst/stack/page-context";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";
import { useResourceContext } from "@btst/stack/plugins/client/hooks";
import { QueryClient } from "@tanstack/react-query";
import { StrictMode, useState } from "react";
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
	const [description, setDescription] = useState("BTST packed core consumer");
	const overrides = usePluginOverrides<{ label: string }>("consumerProbe");
	const resource = useResourceContext("consumerProbe");
	useRegisterPageAIContext({
		routeName: "consumer-probe",
		pageDescription: description,
	});
	return (
		<main>
			<h1>{overrides.label}</h1>
			<output data-testid="page-context">
				{usePageAIContext()?.pageDescription}
			</output>
			<output data-testid="query-context">
				{resource.queryClient === stack.provider.queryClient
					? "Shared Core instance"
					: "Different Core instance"}
			</output>
			<button
				type="button"
				onClick={() => setDescription("Core context updated")}
			>
				Update context
			</button>
		</main>
	);
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
