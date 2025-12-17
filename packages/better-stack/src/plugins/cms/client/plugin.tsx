import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
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
	path: string;
	params?: Record<string, string>;
	isSSR: boolean;
	apiBaseURL: string;
	apiBasePath: string;
	headers?: Headers;
}

/**
 * Configuration for CMS client plugin
 */
export interface CMSClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
}

/**
 * Create dashboard loader for SSR
 */
function createDashboardLoader(config: CMSClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers } = config;
			const client = createApiClient<CMSApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const queries = createCMSQueryKeys(client, headers);

			try {
				await queryClient.prefetchQuery(queries.cmsTypes.list());
			} catch {
				// Let Error Boundaries handle errors during render
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
			const { queryClient, apiBasePath, apiBaseURL, headers } = config;
			const client = createApiClient<CMSApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const queries = createCMSQueryKeys(client, headers);

			try {
				await Promise.all([
					queryClient.prefetchQuery(queries.cmsTypes.list()),
					queryClient.prefetchQuery(
						queries.cmsContent.list({ typeSlug, limit: 20, offset: 0 }),
					),
				]);
			} catch {
				// Let Error Boundaries handle errors during render
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
			const { queryClient, apiBasePath, apiBaseURL, headers } = config;
			const client = createApiClient<CMSApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const queries = createCMSQueryKeys(client, headers);

			try {
				const promises = [queryClient.prefetchQuery(queries.cmsTypes.list())];
				if (id) {
					promises.push(
						queryClient.prefetchQuery(queries.cmsContent.detail(typeSlug, id)),
					);
				}
				await Promise.all(promises);
			} catch {
				// Let Error Boundaries handle errors during render
			}
		}
	};
}

/**
 * Create dashboard meta generator
 */
function createDashboardMeta() {
	return () => [
		{ title: "CMS Dashboard" },
		{ name: "robots", content: "noindex" },
	];
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

		return [
			{
				title: contentType?.name
					? `${contentType.name} | CMS`
					: "Content | CMS",
			},
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

		return [{ title }, { name: "robots", content: "noindex" }];
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
