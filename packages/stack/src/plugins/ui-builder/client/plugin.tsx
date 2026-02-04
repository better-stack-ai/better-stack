// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { CMSApiRouter } from "../../cms/api";
import { createCMSQueryKeys } from "../../cms/query-keys";
import { UI_BUILDER_TYPE_SLUG } from "../schemas";
import type {
	UIBuilderClientHooks,
	LoaderContext,
	ComponentRegistry,
} from "../types";

// Lazy load page components for code splitting
const PageListPageComponent = lazy(() =>
	import("./components/pages/page-list-page").then((m) => ({
		default: m.PageListPage,
	})),
);
const PageBuilderPageComponent = lazy(() =>
	import("./components/pages/page-builder-page").then((m) => ({
		default: m.PageBuilderPage,
	})),
);

/**
 * Configuration for UI Builder client plugin
 */
export interface UIBuilderClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client instance for caching */
	queryClient: QueryClient;
	/** Optional headers for SSR (e.g., forwarding cookies) */
	headers?: Headers;
	/** Optional hooks for customizing behavior (authorization, redirects, etc.) */
	hooks?: UIBuilderClientHooks;
	/** Component registry to use for the UI Builder */
	componentRegistry?: ComponentRegistry;
}

/**
 * Create page list loader for SSR
 */
function createPageListLoader(config: UIBuilderClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const typeSlug = UI_BUILDER_TYPE_SLUG;

			const context: LoaderContext = {
				path: "/ui-builder",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadPageList) {
					const canLoad = await hooks.beforeLoadPageList(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadPageList hook");
					}
				}

				const client = createApiClient<CMSApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createCMSQueryKeys(client, headers);
				const limit = 20;

				// Prefetch pages using infinite query
				const listQuery = queries.cmsContent.list({
					typeSlug,
					limit,
					offset: 0,
				});
				await queryClient.prefetchInfiniteQuery({
					queryKey: [...listQuery.queryKey, "ui-builder"],
					queryFn: async ({ pageParam = 0 }) => {
						const response: unknown = await client("/content/:typeSlug", {
							method: "GET",
							params: { typeSlug },
							query: { limit, offset: pageParam },
							headers,
						});
						if (
							typeof response === "object" &&
							response !== null &&
							"error" in response &&
							response.error
						) {
							throw new Error(String(response.error));
						}
						return (response as { data?: unknown }).data;
					},
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadPageList) {
					await hooks.afterLoadPageList(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState([
					...listQuery.queryKey,
					"ui-builder",
				]);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

/**
 * Create page builder loader for SSR
 */
function createPageBuilderLoader(
	id: string | undefined,
	config: UIBuilderClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const typeSlug = UI_BUILDER_TYPE_SLUG;

			const context: LoaderContext = {
				path: id ? `/ui-builder/${id}/edit` : "/ui-builder/new",
				params: id ? { id } : {},
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadPageBuilder) {
					const canLoad = await hooks.beforeLoadPageBuilder(id, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadPageBuilder hook");
					}
				}

				const client = createApiClient<CMSApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createCMSQueryKeys(client, headers);

				// Prefetch page if editing
				if (id) {
					await queryClient.prefetchQuery(
						queries.cmsContent.detail(typeSlug, id),
					);
				}

				// After hook
				if (hooks?.afterLoadPageBuilder) {
					await hooks.afterLoadPageBuilder(id, context);
				}

				// Check if there was an error
				if (id) {
					const queryState = queryClient.getQueryState(
						queries.cmsContent.detail(typeSlug, id).queryKey,
					);
					if (queryState?.error && hooks?.onLoadError) {
						const error =
							queryState.error instanceof Error
								? queryState.error
								: new Error(String(queryState.error));
						await hooks.onLoadError(error, context);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

/**
 * Create page list meta generator
 */
function createPageListMeta() {
	return () => {
		const title = "UI Builder Pages";
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Create page builder meta generator
 */
function createPageBuilderMeta(
	id: string | undefined,
	config: UIBuilderClientConfig,
) {
	return () => {
		const { queryClient, apiBasePath, apiBaseURL, headers } = config;
		const typeSlug = UI_BUILDER_TYPE_SLUG;

		let pageSlug = "";
		if (id) {
			const client = createApiClient<CMSApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const queries = createCMSQueryKeys(client, headers);
			const page = queryClient.getQueryData(
				queries.cmsContent.detail(typeSlug, id).queryKey,
			) as { slug: string } | undefined;
			pageSlug = page?.slug || "";
		}

		const title = id ? `Edit ${pageSlug || "Page"}` : "New Page";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * UI Builder client plugin
 * Provides routes and components for the UI Builder admin interface
 *
 * @example
 * ```typescript
 * import { uiBuilderClientPlugin } from "@btst/stack/plugins/ui-builder/client"
 *
 * "ui-builder": uiBuilderClientPlugin({
 *   apiBaseURL: baseURL,
 *   apiBasePath: "/api/data",
 *   siteBaseURL: baseURL,
 *   siteBasePath: "/pages",
 *   queryClient,
 *   hooks: {
 *     beforeLoadPageList: async (ctx) => {
 *       const session = await getSession(ctx.headers)
 *       return session?.user?.isAdmin === true
 *     },
 *     beforeLoadPageBuilder: async (pageId, ctx) => {
 *       const session = await getSession(ctx.headers)
 *       return session?.user?.isAdmin === true
 *     },
 *     onLoadError: () => redirect("/auth/sign-in"),
 *   },
 * })
 * ```
 */
export const uiBuilderClientPlugin = (config: UIBuilderClientConfig) =>
	defineClientPlugin({
		name: "ui-builder",

		routes: () => ({
			pageList: createRoute("/ui-builder", () => ({
				PageComponent: () => <PageListPageComponent />,
				loader: createPageListLoader(config),
				meta: createPageListMeta(),
			})),

			newPage: createRoute("/ui-builder/new", () => ({
				PageComponent: () => <PageBuilderPageComponent />,
				loader: createPageBuilderLoader(undefined, config),
				meta: createPageBuilderMeta(undefined, config),
			})),

			editPage: createRoute("/ui-builder/:id/edit", ({ params }) => ({
				PageComponent: () => <PageBuilderPageComponent id={params.id} />,
				loader: createPageBuilderLoader(params.id, config),
				meta: createPageBuilderMeta(params.id, config),
			})),
		}),

		sitemap: async () => {
			// UI Builder admin pages should NOT be in sitemap
			return [];
		},
	});
