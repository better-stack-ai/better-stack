import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import { LibraryPageComponent } from "./components/pages/library-page";
import { createMediaQueryKeys } from "../query-keys";
import type { MediaApiRouter } from "../api/plugin";

export interface MediaLoaderContext {
	path: string;
	isSSR: boolean;
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
}

export interface MediaClientHooks {
	/** Called before the media library data is fetched during SSR. Throw to cancel. */
	beforeLoadLibrary?: (context: MediaLoaderContext) => Promise<void> | void;

	/** Called after the media library data is fetched during SSR. */
	afterLoadLibrary?: (context: MediaLoaderContext) => Promise<void> | void;

	/** Called when an error occurs during the SSR loader. */
	onLoadError?: (
		error: Error,
		context: MediaLoaderContext,
	) => Promise<void> | void;
}

export interface MediaClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site for SEO meta tags */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client — used by the SSR loader to prefetch data */
	queryClient: QueryClient;
	/** Optional headers forwarded with SSR API requests (e.g. auth cookies) */
	headers?: HeadersInit;
	/** Optional lifecycle hooks for the media client plugin */
	hooks?: MediaClientHooks;
}

/**
 * Media client plugin.
 * Registers the /media library route.
 *
 * Configure overrides in StackProvider:
 * ```tsx
 * <StackProvider overrides={{ media: { apiBaseURL, apiBasePath, queryClient, uploadMode: "direct", navigate } }}>
 * ```
 *
 * @example
 * ```ts
 * import { mediaClientPlugin } from "@btst/stack/plugins/media/client"
 *
 * const clientPlugins = [
 *   mediaClientPlugin({ apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, queryClient }),
 *   // ...other plugins
 * ]
 * ```
 */
export const mediaClientPlugin = (config: MediaClientConfig) =>
	defineClientPlugin({
		name: "media",

		routes: () => ({
			library: createRoute("/media", () => ({
				PageComponent: LibraryPageComponent,
				loader: createMediaLibraryLoader(config),
				meta: createMediaLibraryMeta(config),
			})),
		}),
	});

function createMediaLibraryLoader(config: MediaClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: MediaLoaderContext = {
				path: "/media",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				if (hooks?.beforeLoadLibrary) {
					await hooks.beforeLoadLibrary(context);
				}

				const client = createApiClient<MediaApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createMediaQueryKeys(client, headers);

				// Prefetch initial asset grid (infinite query — root folder, default limit)
				await queryClient.prefetchInfiniteQuery({
					...queries.mediaAssets.list({ limit: 40 }),
					initialPageParam: 0,
				});

				// Prefetch root-level folders for the sidebar tree
				await queryClient.prefetchQuery(queries.mediaFolders.list(null));

				if (hooks?.afterLoadLibrary) {
					await hooks.afterLoadLibrary(context);
				}

				const queryState = queryClient.getQueryState(
					queries.mediaAssets.list({ limit: 40 }).queryKey,
				);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/media] route.loader() failed — no server running at build time. " +
							"The media library does not support SSG.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

function createMediaLibraryMeta(config: MediaClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath } = config;
		const fullUrl = `${siteBaseURL}${siteBasePath}/media`;
		const title = "Media Library";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: "Manage your media assets" },
			{ name: "robots", content: "noindex, nofollow" },

			// Open Graph
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{
				property: "og:description",
				content: "Manage your media assets",
			},
			{ property: "og:url", content: fullUrl },

			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}
