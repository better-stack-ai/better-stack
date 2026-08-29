import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { normalizePath } from "@btst/stack/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import { lazy, type ComponentType } from "react";
import type { MediaApiRouter } from "../api/plugin";
import type { MediaIdentityPartition } from "../api/query-key-defs";
import { createMediaQueryKeys } from "../query-keys";
import { MEDIA_PLUGIN_ID } from "./constants";
import type {
	MediaPluginOverrides,
	MediaProviderConfig,
	MediaUploadMode,
} from "./overrides";

const LibraryPageComponent = lazy(() =>
	import("./components/pages/library-page").then((module) => ({
		default: module.LibraryPageComponent,
	})),
);

/** Resolved request context supplied to Media SSR loader hooks. */
export interface MediaLoaderContext {
	/** Normalized Media route path being loaded. */
	path: string;
	/** Whether the hook is running during server-side rendering. */
	isSSR: boolean;
	/** Resolved absolute origin for the Media backend. */
	apiBaseURL: string;
	/** Resolved path where the Media backend is mounted. */
	apiBasePath: string;
	/** Request-scoped server headers used by the Media SSR loader. */
	headers?: Headers;
}

export interface MediaClientHooks {
	/** Called before the media library data is fetched during SSR. Throw to cancel. */
	beforeLoadLibrary?: (context: MediaLoaderContext) => Promise<void> | void;

	/** Called after the media library data is fetched during SSR. */
	afterLoadLibrary?: (context: MediaLoaderContext) => Promise<void> | void;

	/**
	 * Reports an SSR loader failure once. Callback failures are contained and
	 * cannot make the loader reject.
	 */
	onErrorLoad?: (
		error: Error,
		context: MediaLoaderContext,
	) => Promise<void> | void;
}

/**
 * Media-specific client configuration. Shared API, site, query-client, and
 * request-header values are inherited from `createClientStack()`.
 */
export interface MediaClientConfig {
	/** Upload transport matching the storage adapter configured on the backend. */
	uploadMode?: MediaUploadMode;
	/** Identity snapshot used to align protected SSR prefetch and browser keys. */
	identityPartition?: MediaIdentityPartition;
	/** Optional lifecycle hooks for the media client plugin. */
	hooks?: MediaClientHooks;
	/** Optional replacement for the media library page. */
	pageComponents?: {
		library?: ComponentType;
	};
}

interface ResolvedMediaClientConfig extends MediaClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveMediaClientConfig(
	config: MediaClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof MEDIA_PLUGIN_ID>,
): ResolvedMediaClientConfig {
	return {
		uploadMode: config.uploadMode,
		identityPartition: config.identityPartition,
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

function createMediaApiClient(config: ResolvedMediaClientConfig) {
	return createApiClient<MediaApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: MediaClientHooks | undefined,
	context: MediaLoaderContext,
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
			// Reporting hooks cannot make an SSR loader reject or report twice.
		}
	};
}

function createMediaLibraryLoader(config: ResolvedMediaClientConfig) {
	return async () => {
		if (typeof window !== "undefined") return;

		const {
			queryClient,
			apiBasePath,
			apiBaseURL,
			hooks,
			headers,
			identityPartition,
		} = config;
		const context: MediaLoaderContext = {
			path: "/media",
			isSSR: true,
			apiBaseURL,
			apiBasePath,
			headers,
		};
		const reportError = createLoadErrorReporter(hooks, context);
		const queries = createMediaQueryKeys(createMediaApiClient(config));
		const assetQuery = queries.mediaAssets.list(
			{ limit: 40 },
			identityPartition,
		);
		const folderQuery = queries.mediaFolders.list(undefined, identityPartition);

		try {
			await hooks?.beforeLoadLibrary?.(context);
			await queryClient.prefetchInfiniteQuery({
				...assetQuery,
				initialPageParam: 0,
			});
			await queryClient.prefetchQuery(folderQuery);
			await hooks?.afterLoadLibrary?.(context);

			const queryError =
				queryClient.getQueryState(assetQuery.queryKey)?.error ??
				queryClient.getQueryState(folderQuery.queryKey)?.error;
			if (queryError) await reportError(queryError);
		} catch (error) {
			if (isConnectionError(error)) {
				console.warn(
					"[btst/media] route.loader() failed — no server running at build time. " +
						"For an explicitly public static library, use the explicit " +
						"stack.raw.media.prefetchForRoute() server helper instead.",
				);
			} else {
				const sanitizedError = createSanitizedSSRLoaderError();
				await queryClient.prefetchInfiniteQuery({
					queryKey: assetQuery.queryKey,
					queryFn: () => {
						throw sanitizedError;
					},
					initialPageParam: 0,
					retry: false,
				});
			}
			await reportError(error);
		}
	};
}

function createMediaLibraryMeta(config: ResolvedMediaClientConfig) {
	return () => {
		const sitePath = normalizePath([config.siteBasePath, "/media"].join("/"));
		const fullUrl = `${config.siteBaseURL}${sitePath}`;
		const title = "Media Library";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: "Manage your media assets" },
			{ name: "robots", content: "noindex, nofollow" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: "Manage your media assets" },
			{ property: "og:url", content: fullUrl },
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

function createResolvedMediaPlugin(config: ResolvedMediaClientConfig) {
	return {
		routes: () =>
			defineRoutes(
				{
					library: defineRoute("/media", {
						page: LibraryPageComponent,
						loader: createMediaLibraryLoader(config),
						meta: createMediaLibraryMeta(config),
					}),
				},
				{ pages: config.pageComponents },
			),
	};
}

/** Registers the Media library against the enclosing resolved client runtime. */
export const mediaClientPlugin = (config: MediaClientConfig = {}) =>
	defineClientPlugin<MediaPluginOverrides>()({
		id: MEDIA_PLUGIN_ID,
		providerConfig: {
			...(config.uploadMode ? { uploadMode: config.uploadMode } : {}),
		} satisfies MediaProviderConfig,
		resolve: (runtime) =>
			createResolvedMediaPlugin(resolveMediaClientConfig(config, runtime)),
	});
