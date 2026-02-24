import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { CMSApiRouter } from "../api";
import { createCMSQueryKeys } from "../query-keys";

// Lazy load page components for code splitting
const DashboardPageComponent = lazy(() =>
	import("./components/pages/dashboard-page").then((m) => ({
		default: m.DashboardPageComponent,
	})),
);
const ContentListPageComponent = lazy(() =>
	import("./components/pages/content-list-page").then((m) => ({
		default: m.ContentListPageComponent,
	})),
);
const ContentEditorPageComponent = lazy(() =>
	import("./components/pages/content-editor-page").then((m) => ({
		default: m.ContentEditorPageComponent,
	})),
);

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { typeSlug: "product", id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Optional headers for the request */
	headers?: Headers;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Hooks for CMS client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface CMSClientHooks {
	/**
	 * Called before loading the dashboard page. Return false to cancel loading.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadDashboard?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called after the dashboard is loaded.
	 * @param context - Loader context
	 */
	afterLoadDashboard?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading a content list page. Return false to cancel loading.
	 * @param typeSlug - The content type slug
	 * @param context - Loader context
	 */
	beforeLoadContentList?: (
		typeSlug: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after a content list is loaded.
	 * @param typeSlug - The content type slug
	 * @param context - Loader context
	 */
	afterLoadContentList?: (
		typeSlug: string,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called before loading the content editor page. Return false to cancel loading.
	 * @param typeSlug - The content type slug
	 * @param id - The content item ID (undefined for new items)
	 * @param context - Loader context
	 */
	beforeLoadContentEditor?: (
		typeSlug: string,
		id: string | undefined,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after the content editor is loaded.
	 * @param typeSlug - The content type slug
	 * @param id - The content item ID (undefined for new items)
	 * @param context - Loader context
	 */
	afterLoadContentEditor?: (
		typeSlug: string,
		id: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called when a loading error occurs.
	 * Use this for redirects on authorization failures.
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * Configuration for CMS client plugin
 */
export interface CMSClientConfig {
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
	hooks?: CMSClientHooks;
}

/**
 * Create dashboard loader for SSR
 */
function createDashboardLoader(config: CMSClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: "/cms",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadDashboard) {
					const canLoad = await hooks.beforeLoadDashboard(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadDashboard hook");
					}
				}

				const client = createApiClient<CMSApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createCMSQueryKeys(client, headers);

				await queryClient.prefetchQuery(queries.cmsTypes.list());

				// After hook
				if (hooks?.afterLoadDashboard) {
					await hooks.afterLoadDashboard(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState(
					queries.cmsTypes.list().queryKey,
				);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
							"Use myStack.api.cms.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

/**
 * Create content list loader for SSR
 */
function createContentListLoader(typeSlug: string, config: CMSClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: `/cms/${typeSlug}`,
				params: { typeSlug },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadContentList) {
					const canLoad = await hooks.beforeLoadContentList(typeSlug, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadContentList hook");
					}
				}

				const client = createApiClient<CMSApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createCMSQueryKeys(client, headers);
				const limit = 20;

				// Prefetch content types
				await queryClient.prefetchQuery(queries.cmsTypes.list());

				// Prefetch content list using infinite query (matches useSuspenseInfiniteQuery in hooks)
				const listQuery = queries.cmsContent.list({
					typeSlug,
					limit,
					offset: 0,
				});
				await queryClient.prefetchInfiniteQuery({
					queryKey: listQuery.queryKey,
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
				if (hooks?.afterLoadContentList) {
					await hooks.afterLoadContentList(typeSlug, context);
				}

				// Check if there was an error in either query
				const typesState = queryClient.getQueryState(
					queries.cmsTypes.list().queryKey,
				);
				const listState = queryClient.getQueryState(listQuery.queryKey);
				const queryError = typesState?.error || listState?.error;
				if (queryError && hooks?.onLoadError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
							"Use myStack.api.cms.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

/**
 * Create content editor loader for SSR
 */
function createContentEditorLoader(
	typeSlug: string,
	id: string | undefined,
	config: CMSClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: id ? `/cms/${typeSlug}/${id}` : `/cms/${typeSlug}/new`,
				params: id ? { typeSlug, id } : { typeSlug },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadContentEditor) {
					const canLoad = await hooks.beforeLoadContentEditor(
						typeSlug,
						id,
						context,
					);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadContentEditor hook");
					}
				}

				const client = createApiClient<CMSApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createCMSQueryKeys(client, headers);

				const promises = [queryClient.prefetchQuery(queries.cmsTypes.list())];
				if (id) {
					promises.push(
						queryClient.prefetchQuery(queries.cmsContent.detail(typeSlug, id)),
					);
				}
				await Promise.all(promises);

				// After hook
				if (hooks?.afterLoadContentEditor) {
					await hooks.afterLoadContentEditor(typeSlug, id, context);
				}

				// Check if there was an error
				const typesState = queryClient.getQueryState(
					queries.cmsTypes.list().queryKey,
				);
				const itemState = id
					? queryClient.getQueryState(
							queries.cmsContent.detail(typeSlug, id).queryKey,
						)
					: null;
				const queryError = typesState?.error || itemState?.error;
				if (queryError && hooks?.onLoadError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
							"Use myStack.api.cms.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

/**
 * Create dashboard meta generator
 */
function createDashboardMeta() {
	return () => {
		const title = "CMS Dashboard";
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Create content list meta generator
 */
function createContentListMeta(typeSlug: string, config: CMSClientConfig) {
	return () => {
		const { queryClient, apiBasePath, apiBaseURL } = config;
		const client = createApiClient<CMSApiRouter>({
			baseURL: apiBaseURL,
			basePath: apiBasePath,
		});
		const queries = createCMSQueryKeys(client);
		const contentTypes = queryClient.getQueryData(
			queries.cmsTypes.list().queryKey,
		);
		const contentType = (
			contentTypes as Array<{ slug: string; name: string }> | undefined
		)?.find((ct) => ct.slug === typeSlug);

		const title = contentType?.name
			? `${contentType.name} | CMS`
			: "Content | CMS";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Create content editor meta generator
 */
function createContentEditorMeta(
	typeSlug: string,
	id: string | undefined,
	config: CMSClientConfig,
) {
	return () => {
		const { queryClient, apiBasePath, apiBaseURL } = config;
		const client = createApiClient<CMSApiRouter>({
			baseURL: apiBaseURL,
			basePath: apiBasePath,
		});
		const queries = createCMSQueryKeys(client);
		const contentTypes = queryClient.getQueryData(
			queries.cmsTypes.list().queryKey,
		);
		const contentType = (
			contentTypes as Array<{ slug: string; name: string }> | undefined
		)?.find((ct) => ct.slug === typeSlug);

		const title = id
			? `Edit ${contentType?.name || "Content"} | CMS`
			: `New ${contentType?.name || "Content"} | CMS`;

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * CMS client plugin
 * Provides routes and components for the CMS admin interface
 */
export const cmsClientPlugin = (config: CMSClientConfig) =>
	defineClientPlugin({
		name: "cms",

		routes: () => ({
			dashboard: createRoute("/cms", () => ({
				PageComponent: () => <DashboardPageComponent />,
				loader: createDashboardLoader(config),
				meta: createDashboardMeta(),
			})),

			contentList: createRoute("/cms/:typeSlug", ({ params }) => ({
				PageComponent: () => (
					<ContentListPageComponent typeSlug={params.typeSlug} />
				),
				loader: createContentListLoader(params.typeSlug, config),
				meta: createContentListMeta(params.typeSlug, config),
			})),

			newContent: createRoute("/cms/:typeSlug/new", ({ params }) => ({
				PageComponent: () => (
					<ContentEditorPageComponent typeSlug={params.typeSlug} />
				),
				loader: createContentEditorLoader(params.typeSlug, undefined, config),
				meta: createContentEditorMeta(params.typeSlug, undefined, config),
			})),

			editContent: createRoute("/cms/:typeSlug/:id", ({ params }) => ({
				PageComponent: () => (
					<ContentEditorPageComponent
						typeSlug={params.typeSlug}
						id={params.id}
					/>
				),
				loader: createContentEditorLoader(params.typeSlug, params.id, config),
				meta: createContentEditorMeta(params.typeSlug, params.id, config),
			})),
		}),

		sitemap: async () => {
			// CMS admin pages should NOT be in sitemap
			return [];
		},
	});
