import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { searchClientPlugin } from "@btst/plugin-search/client";
import { SearchInput } from "@btst/plugin-search/client/components";
import "@btst/plugin-search/css";

globalThis.fetch = async (input) => {
	const url = new URL(String(input));
	if (!url.pathname.endsWith("/search"))
		throw new Error(`Unexpected request ${input}`);
	const q = url.searchParams.get("q") ?? "";
	return Response.json({
		items: q.toLowerCase().includes("packed")
			? [
					{
						key: "application:guide",
						sourceId: "application",
						sourceLabel: "Application",
						resourceId: "guide",
						title: "Packed search guide",
						snippet: "Standalone application discovery",
						href: "/pages/guide",
					},
				]
			: [],
		sources: [{ id: "application", label: "Application" }],
		page: 1,
		limit: 20,
		hasMore: false,
		nextPage: null,
		truncated: false,
	});
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: location.origin, basePath: "/api" },
	site: { baseURL: location.origin, basePath: "/pages" },
	queryClient,
	plugins: { search: searchClientPlugin() },
});
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{
				navigate: (href) => {
					localStorage.setItem("search-destination", href);
				},
			}}
		>
			<h1>Standalone Search</h1>
			<SearchInput sources={["application"]} />
		</StackProvider>
	</QueryClientProvider>,
);
