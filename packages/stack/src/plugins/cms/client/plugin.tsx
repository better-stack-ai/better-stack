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
import { createSanitizedSSRLoaderError } from "../../utils";
import type { CMSApiRouter } from "../api";
import { createCMSQueryKeys } from "../query-keys";
import { CMS_PLUGIN_ID } from "./constants";
import type { CMSPluginOverrides } from "./overrides";

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
	 * Called before loading the dashboard page. If it throws, remaining loader
	 * work stops, `onErrorLoad` is notified, and the loader still resolves.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadDashboard?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called after the dashboard is loaded.
	 * @param context - Loader context
	 */
	afterLoadDashboard?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading a content list page. If it throws, remaining loader
	 * work stops, `onErrorLoad` is notified, and the loader still resolves.
	 * @param typeSlug - The content type slug
	 * @param context - Loader context
	 */
	beforeLoadContentList?: (
		typeSlug: string,
		context: LoaderContext,
	) => Promise<void> | void;
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
	 * Called before loading the content editor page. If it throws, remaining
	 * loader work stops, `onErrorLoad` is notified, and the loader still resolves.
	 * @param typeSlug - The content type slug
	 * @param id - The content item ID (undefined for new items)
	 * @param context - Loader context
	 */
	beforeLoadContentEditor?: (
		typeSlug: string,
		id: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
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
	 * This is a reporting-only observer. Callback errors are contained and the
	 * loader never rejects, so throwing framework redirects are not supported.
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * CMS-specific client configuration. Shared API, site, query-client, and
 * request-header values are inherited from `createClientStack()`.
 */
export interface CMSClientConfig {
	/** Optional hooks for route loading, error reporting, and telemetry. */
	hooks?: CMSClientHooks;

	/**
	 * Optional page component overrides.
	 * Replace any plugin page with a custom React component.
	 * The built-in component is used as the fallback when not provided.
	 */
	pageComponents?: {
		/** Replaces the CMS dashboard page */
		dashboard?: ComponentType;
		/** Replaces the content list page */
		contentList?: ComponentType<{ params: { typeSlug: string } }>;
		/** Replaces the new content editor page */
		newContent?: ComponentType<{ params: { typeSlug: string } }>;
		/** Replaces the edit content editor page */
		editContent?: ComponentType<{ params: { typeSlug: string; id: string } }>;
	};
}

interface ResolvedCMSClientConfig extends CMSClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveCMSClientConfig(
	config: CMSClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof CMS_PLUGIN_ID>,
): ResolvedCMSClientConfig {
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

function createCMSApiClient(config: ResolvedCMSClientConfig) {
	return createApiClient<CMSApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: CMSClientHooks | undefined,
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
 * Create dashboard loader for SSR
 */
function createDashboardLoader(config: ResolvedCMSClientConfig) {
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createCMSQueryKeys(createCMSApiClient(config));
			const typesQuery = queries.cmsTypes.list();

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadDashboard) {
					await hooks.beforeLoadDashboard(context);
				}

				await queryClient.prefetchQuery(typesQuery);

				// After hook
				if (hooks?.afterLoadDashboard) {
					await hooks.afterLoadDashboard(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState(typesQuery.queryKey);
				if (queryState?.error) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await reportError(error);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.cms.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: typesQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						retry: false,
					});
				}
				await reportError(error);
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

/**
 * Create content list loader for SSR
 */
function createContentListLoader(
	typeSlug: string,
	config: ResolvedCMSClientConfig,
) {
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createCMSQueryKeys(createCMSApiClient(config));
			const limit = 20;
			const typesQuery = queries.cmsTypes.list();
			const listQuery = queries.cmsContent.list({ typeSlug, limit });

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadContentList) {
					await hooks.beforeLoadContentList(typeSlug, context);
				}

				// Prefetch content types
				await queryClient.prefetchQuery(typesQuery);

				// Prefetch content list using infinite query (matches useSuspenseInfiniteQuery in hooks)
				await queryClient.prefetchInfiniteQuery({
					...listQuery,
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadContentList) {
					await hooks.afterLoadContentList(typeSlug, context);
				}

				// Check if there was an error in either query
				const typesState = queryClient.getQueryState(typesQuery.queryKey);
				const listState = queryClient.getQueryState(listQuery.queryKey);
				const queryError = typesState?.error || listState?.error;
				if (queryError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await reportError(error);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
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
	config: ResolvedCMSClientConfig,
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createCMSQueryKeys(createCMSApiClient(config));
			const typesQuery = queries.cmsTypes.list();
			const detailQuery = id
				? queries.cmsContent.detail(typeSlug, id)
				: undefined;

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadContentEditor) {
					await hooks.beforeLoadContentEditor(typeSlug, id, context);
				}

				const promises = [queryClient.prefetchQuery(typesQuery)];
				if (id) {
					promises.push(queryClient.prefetchQuery(detailQuery!));
				}
				await Promise.all(promises);

				// After hook
				if (hooks?.afterLoadContentEditor) {
					await hooks.afterLoadContentEditor(typeSlug, id, context);
				}

				// Check if there was an error
				const typesState = queryClient.getQueryState(typesQuery.queryKey);
				const itemState = id
					? queryClient.getQueryState(detailQuery!.queryKey)
					: null;
				const queryError = typesState?.error || itemState?.error;
				if (queryError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await reportError(error);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (isConnectionError(error)) {
					console.warn(
						"[btst/cms] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.cms.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: typesQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						retry: false,
					});
					if (detailQuery) {
						await queryClient.prefetchQuery({
							queryKey: detailQuery.queryKey,
							queryFn: () => {
								throw errToStore;
							},
							retry: false,
						});
					}
				}
				await reportError(error);
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
function createContentListMeta(
	typeSlug: string,
	config: ResolvedCMSClientConfig,
) {
	return () => {
		const { queryClient } = config;
		const queries = createCMSQueryKeys(createCMSApiClient(config));
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
	config: ResolvedCMSClientConfig,
) {
	return () => {
		const { queryClient } = config;
		const queries = createCMSQueryKeys(createCMSApiClient(config));
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

function createResolvedCMSPlugin(config: ResolvedCMSClientConfig) {
	return {
		routes: () =>
			defineRoutes(
				{
					dashboard: defineRoute("/cms", {
						page: DashboardPageComponent,
						loader: createDashboardLoader(config),
						meta: createDashboardMeta(),
					}),

					contentList: defineRoute("/cms/:typeSlug", {
						page: ({ params }) => (
							<ContentListPageComponent typeSlug={params.typeSlug} />
						),
						loader: ({ params }) =>
							createContentListLoader(params.typeSlug, config)(),
						meta: ({ params }) =>
							createContentListMeta(params.typeSlug, config)(),
					}),

					newContent: defineRoute("/cms/:typeSlug/new", {
						page: ({ params }) => (
							<ContentEditorPageComponent typeSlug={params.typeSlug} />
						),
						loader: ({ params }) =>
							createContentEditorLoader(params.typeSlug, undefined, config)(),
						meta: ({ params }) =>
							createContentEditorMeta(params.typeSlug, undefined, config)(),
					}),

					editContent: defineRoute("/cms/:typeSlug/:id", {
						page: ({ params }) => (
							<ContentEditorPageComponent
								typeSlug={params.typeSlug}
								id={params.id}
							/>
						),
						loader: ({ params }) =>
							createContentEditorLoader(params.typeSlug, params.id, config)(),
						meta: ({ params }) =>
							createContentEditorMeta(params.typeSlug, params.id, config)(),
					}),
				},
				{ pages: config.pageComponents },
			),

		sitemap: async () => {
			// CMS admin pages should NOT be in sitemap
			return [];
		},
	};
}

/**
 * CMS client plugin
 * Provides routes and components for the CMS admin interface.
 *
 * @param config - Optional CMS-specific behavior and page choices.
 */
export const cmsClientPlugin = (config: CMSClientConfig = {}) =>
	defineClientPlugin<CMSPluginOverrides>()({
		id: CMS_PLUGIN_ID,
		resolve: (runtime) =>
			createResolvedCMSPlugin(resolveCMSClientConfig(config, runtime)),
	});
