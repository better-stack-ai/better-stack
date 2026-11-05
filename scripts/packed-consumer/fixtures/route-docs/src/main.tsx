import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineClientPlugin, defineRoute } from "@btst/stack/plugins/client";
import {
	routeDocsClientPlugin,
	useRegisteredRoutes,
} from "@btst/plugin-route-docs/client";
import "@btst/plugin-route-docs/css";

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: location.origin, basePath: "/api" },
	site: { baseURL: location.origin, basePath: "/pages" },
	queryClient,
	plugins: {
		catalog: defineClientPlugin({
			id: "catalog",
			resolve: () => ({
				routes: () => ({
					item: defineRoute("/catalog/:slug", { page: () => null }),
				}),
				sitemap: () => [
					{ url: `${location.origin}/pages/catalog/v5-existing` },
				],
			}),
		}),
		routeDocs: routeDocsClientPlugin({ title: "Packed route documentation" }),
	},
});
function RegisteredRoutes() {
	const routes = useRegisteredRoutes();
	return (
		<output data-testid="registered-routes">{JSON.stringify(routes)}</output>
	);
}
const Page = stack.router.getRoute("/route-docs")!.PageComponent!;
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider stack={stack} router={{ navigate: () => undefined }}>
			<RegisteredRoutes />
			<Suspense fallback={<p>Loading documentation</p>}>
				<Page />
			</Suspense>
		</StackProvider>
	</QueryClientProvider>,
);
