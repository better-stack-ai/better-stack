import { createClientStack } from "@btst/stack/client";
import { blogClientPlugin } from "@btst/plugin-blog/client";
import type { QueryClient } from "@tanstack/react-query";

export function createEditorialClient(
	queryClient: QueryClient,
	origins: { apiOrigin: string; siteOrigin: string },
	headers?: Headers,
) {
	return createClientStack({
		api: { baseURL: origins.apiOrigin, basePath: "/api/editorial", headers },
		site: { baseURL: origins.siteOrigin, basePath: "/editorial" },
		queryClient,
		plugins: { blog: blogClientPlugin({ editorialWorkflow: true }) },
	});
}
