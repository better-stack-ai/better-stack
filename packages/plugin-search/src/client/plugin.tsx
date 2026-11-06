import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import type { ComponentType } from "react";
import {
	createSearchQueryKeys,
	type SearchIdentityPartition,
} from "../query-keys";
import { SearchPageComponent } from "./components/pages/search-page";
import { SEARCH_PLUGIN_ID } from "./constants";
import type { SearchPluginOverrides } from "./overrides";
import { parseSearchState } from "./search-state";

/** Search route views and request-local SSR state. */
export interface SearchClientConfig {
	/** The request query string, forwarded by the framework's server route. */
	searchParams?: URLSearchParams | string;
	/** Match the identity passed to StackProvider when hydrating private providers. */
	identityPartition?: SearchIdentityPartition;
	/** Replace the route view while retaining search prefetch and metadata. */
	pageComponents?: { search?: ComponentType };
	/** Observe server prefetching. Reporter failures never reject route rendering. */
	hooks?: {
		beforeLoad?: () => void | Promise<void>;
		afterLoad?: () => void | Promise<void>;
		onErrorLoad?: (error: unknown) => void | Promise<void>;
	};
}

export const searchClientPlugin = (config: SearchClientConfig = {}) =>
	defineClientPlugin<SearchPluginOverrides>()({
		id: SEARCH_PLUGIN_ID,
		resolve: (runtime) => {
			const state = parseSearchState(config.searchParams);
			const queries = createSearchQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const entry = queries.searchResults.list(
				{
					q: state.q,
					sources: state.sources ? state.sources.split(",") : undefined,
					page: state.page,
				},
				config.identityPartition,
			);
			const load = async () => {
				if (typeof window !== "undefined") return;
				let error: unknown;
				try {
					await config.hooks?.beforeLoad?.();
					await runtime.queryClient.prefetchQuery({ ...entry, retry: false });
					error = runtime.queryClient.getQueryState(entry.queryKey)?.error;
					if (!error) await config.hooks?.afterLoad?.();
				} catch (caught) {
					error = caught;
				}
				if (!error) return;
				await runtime.queryClient.prefetchQuery({
					queryKey: entry.queryKey,
					queryFn: () => {
						throw createSanitizedSSRLoaderError();
					},
					retry: false,
					staleTime: 0,
				});
				if (isConnectionError(error))
					console.warn("[btst/search] API unavailable during SSR prefetch.");
				try {
					await config.hooks?.onErrorLoad?.(error);
				} catch {
					/* Reporting cannot reject rendering. */
				}
			};
			return {
				routes: () =>
					defineRoutes(
						{
							search: defineRoute("/search", {
								page: () => (
									<SearchPageComponent
										initialSearch={
											config.searchParams === undefined ? undefined : state
										}
									/>
								),
								loader: load,
								meta: () => [
									{ title: "Search" },
									{ name: "robots", content: "noindex,follow" },
								],
							}),
						},
						{ pages: config.pageComponents },
					),
			};
		},
	});
