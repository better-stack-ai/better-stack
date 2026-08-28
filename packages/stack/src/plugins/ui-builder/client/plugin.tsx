// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { ComponentType } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { CMSApiRouter } from "../../cms/api";
import { CMS_PLUGIN_ID } from "../../cms/client/constants";
import { createSanitizedSSRLoaderError } from "../../utils";
import { createUIBuilderQueryKeys } from "../query-keys";
import type {
	UIBuilderClientHooks,
	LoaderContext,
	ComponentRegistry,
} from "../types";
import { UI_BUILDER_PLUGIN_ID } from "./constants";
import type {
	UIBuilderPluginOverrides,
	UIBuilderProviderConfig,
} from "./overrides";

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
 * UI Builder-specific client configuration. Shared API, site, query-client,
 * and request-header values are inherited from `createClientStack()`.
 */
export interface UIBuilderClientConfig {
	/** Component definitions used by the editor and registered page renderers. */
	components?: ComponentRegistry;
	/** Optional hooks for route loading, error reporting, and telemetry. */
	hooks?: UIBuilderClientHooks;

	/**
	 * Optional page component overrides.
	 * Replace any plugin page with a custom React component.
	 * The built-in component is used as the fallback when not provided.
	 */
	pageComponents?: {
		/** Replaces the page list page */
		pageList?: ComponentType;
		/** Replaces the new page builder page */
		newPage?: ComponentType;
		/** Replaces the edit page builder page */
		editPage?: ComponentType<{ params: { id: string } }>;
	};
}

interface ResolvedUIBuilderClientConfig
	extends Omit<UIBuilderClientConfig, "components"> {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveUIBuilderClientConfig(
	config: UIBuilderClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof UI_BUILDER_PLUGIN_ID>,
): ResolvedUIBuilderClientConfig {
	return {
		hooks: config.hooks,
		pageComponents: config.pageComponents,
		apiBaseURL: runtime.api.baseURL,
		apiBasePath: runtime.api.basePath,
		siteBaseURL: runtime.site.baseURL,
		siteBasePath: runtime.site.basePath,
		queryClient: runtime.queryClient,
		...(runtime.api.headers ? { headers: runtime.api.headers } : {}),
		...(runtime.api.credentials
			? { credentials: runtime.api.credentials }
			: {}),
	};
}

function createUIBuilderApiClient(config: ResolvedUIBuilderClientConfig) {
	return createApiClient<CMSApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: UIBuilderClientHooks | undefined,
	context: LoaderContext,
) {
	let reported = false;
	return async (error: unknown) => {
		if (reported || !hooks?.onErrorLoad) return;
		reported = true;
		try {
			await hooks.onErrorLoad(
				error instanceof Error ? error : new Error(String(error)),
				context,
			);
		} catch {
			// Loader hooks cannot make an SSR loader throw or run twice.
		}
	};
}

/**
 * Create page list loader for SSR
 */
function createPageListLoader(config: ResolvedUIBuilderClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/ui-builder",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createUIBuilderQueryKeys(
				createUIBuilderApiClient(config),
			);
			const listQuery = queries.cmsContent.list({ limit: 10, offset: 0 });

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadPageList) {
					await hooks.beforeLoadPageList(context);
				}

				// Prefetch pages using infinite query
				await queryClient.prefetchInfiniteQuery({
					...listQuery,
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadPageList) {
					await hooks.afterLoadPageList(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await reportError(error);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/ui-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.cms.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchInfiniteQuery({
						queryKey: listQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						initialPageParam: 0,
						retry: false,
					});
				}
				await reportError(error);
			}
		}
	};
}

/**
 * Create page builder loader for SSR
 */
function createPageBuilderLoader(
	id: string | undefined,
	config: ResolvedUIBuilderClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: id ? `/ui-builder/${id}/edit` : "/ui-builder/new",
				params: id ? { id } : {},
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createUIBuilderQueryKeys(
				createUIBuilderApiClient(config),
			);
			const pageQuery = id ? queries.cmsContent.detail(id) : undefined;

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadPageBuilder) {
					await hooks.beforeLoadPageBuilder(id, context);
				}

				// Prefetch page if editing
				if (id) {
					await queryClient.prefetchQuery(pageQuery!);
				}

				// After hook
				if (hooks?.afterLoadPageBuilder) {
					await hooks.afterLoadPageBuilder(id, context);
				}

				// Check if there was an error
				if (id) {
					const queryState = queryClient.getQueryState(pageQuery!.queryKey);
					if (queryState?.error) {
						const error =
							queryState.error instanceof Error
								? queryState.error
								: new Error(String(queryState.error));
						await reportError(error);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/ui-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.cms.prefetchForRoute() for SSG data prefetching.",
					);
				} else if (pageQuery) {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: pageQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						retry: false,
					});
				}
				await reportError(error);
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
	config: ResolvedUIBuilderClientConfig,
) {
	return () => {
		const { queryClient } = config;
		let pageSlug = "";
		if (id) {
			const queries = createUIBuilderQueryKeys(
				createUIBuilderApiClient(config),
			);
			const page = queryClient.getQueryData(
				queries.cmsContent.detail(id).queryKey,
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
 * uiBuilder: uiBuilderClientPlugin({
 *   hooks: {
 *     beforeLoadPageList: async (context) => {
 *       await warmPageListDependencies(context.headers)
 *     },
 *     beforeLoadPageBuilder: async (pageId, context) => {
 *       await recordPageBuilderLoad(pageId, context.headers)
 *     },
 *     onErrorLoad: (error, context) => {
 *       reportPageLoaderError(error, context)
 *     },
 *   },
 * })
 * ```
 */
function createResolvedUIBuilderPlugin(config: ResolvedUIBuilderClientConfig) {
	return {
		routes: () =>
			defineRoutes(
				{
					pageList: defineRoute("/ui-builder", {
						page: PageListPageComponent,
						loader: createPageListLoader(config),
						meta: createPageListMeta(),
					}),

					newPage: defineRoute("/ui-builder/new", {
						page: () => <PageBuilderPageComponent />,
						loader: createPageBuilderLoader(undefined, config),
						meta: createPageBuilderMeta(undefined, config),
					}),

					editPage: defineRoute("/ui-builder/:id/edit", {
						page: ({ params }) => <PageBuilderPageComponent id={params.id} />,
						loader: ({ params }) =>
							createPageBuilderLoader(params.id, config)(),
						meta: ({ params }) => createPageBuilderMeta(params.id, config)(),
					}),
				},
				{ pages: config.pageComponents },
			),

		sitemap: async () => {
			// UI Builder admin pages should NOT be in sitemap
			return [];
		},
	};
}

export const uiBuilderClientPlugin = (config: UIBuilderClientConfig = {}) =>
	defineClientPlugin<UIBuilderPluginOverrides>()({
		id: UI_BUILDER_PLUGIN_ID,
		apiRuntimeFrom: CMS_PLUGIN_ID,
		providerConfig: {
			...(config.components ? { components: config.components } : {}),
		} satisfies UIBuilderProviderConfig,
		resolve: (runtime) =>
			createResolvedUIBuilderPlugin(
				resolveUIBuilderClientConfig(config, runtime),
			),
	});
