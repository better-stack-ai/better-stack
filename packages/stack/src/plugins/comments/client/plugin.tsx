// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	createApiClient,
	defineClientPlugin,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { CommentsApiRouter } from "../api";
import { createCommentsQueryKeys } from "../query-keys";
import { createSanitizedSSRLoaderError } from "../../utils";
import { COMMENTS_PLUGIN_ID } from "./constants";
import type { CommentsPluginOverrides } from "./overrides";

// Lazy load page components for code splitting
const ModerationPageComponent = lazy(() =>
	import("./components/pages/moderation-page").then((m) => ({
		default: m.ModerationPageComponent,
	})),
);

const UserCommentsPageComponent = lazy(() =>
	import("./components/pages/my-comments-page").then((m) => ({
		default: m.UserCommentsPageComponent,
	})),
);

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Optional headers for the request */
	headers?: Headers;
	/**
	 * Optional current user ID for SSR loaders that need user-scoped query keys.
	 * Hooks (e.g. beforeLoadUserComments) may populate this.
	 */
	currentUserId?: string;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Hooks for Comments client plugin
 */
export interface CommentsClientHooks {
	/**
	 * Called before loading the moderation page. Throw to cancel.
	 */
	beforeLoadModeration?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading the User Comments page. Throw to cancel.
	 */
	beforeLoadUserComments?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called when a loading error occurs.
	 * This reporting-only observer cannot make an SSR loader reject.
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * Comments-specific client configuration. Shared API, site, query-client, and
 * request-header values are inherited from `createClientStack()`.
 */
export interface CommentsClientConfig {
	/** Optional route-loader hooks and error reporting. */
	hooks?: CommentsClientHooks;
}

interface ResolvedCommentsClientConfig extends CommentsClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveCommentsClientConfig(
	config: CommentsClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof COMMENTS_PLUGIN_ID>,
): ResolvedCommentsClientConfig {
	return {
		hooks: config.hooks,
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

function createCommentsApiClient(config: ResolvedCommentsClientConfig) {
	return createApiClient<CommentsApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: CommentsClientHooks | undefined,
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
			// Reporting hooks cannot make an SSR loader reject or run twice.
		}
	};
}

function createModerationLoader(config: ResolvedCommentsClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/comments/moderation",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createCommentsQueryKeys(createCommentsApiClient(config));
			const listQuery = queries.comments.list({
				status: "pending",
				limit: 20,
				offset: 0,
			});
			try {
				if (hooks?.beforeLoadModeration) {
					await hooks.beforeLoadModeration(context);
				}
				await queryClient.prefetchQuery(listQuery);
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					await reportError(queryState.error);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/comments] route.loader() failed — no server running at build time.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: listQuery.queryKey,
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

function createUserCommentsLoader(config: ResolvedCommentsClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/comments",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createCommentsQueryKeys(createCommentsApiClient(config));
			const getUserListQuery = (currentUserId: string) =>
				queries.comments.list({
					authorId: currentUserId,
					sort: "desc",
					limit: 20,
					offset: 0,
				});
			try {
				if (hooks?.beforeLoadUserComments) {
					await hooks.beforeLoadUserComments(context);
				}
				const currentUserId =
					typeof context.currentUserId === "string"
						? context.currentUserId
						: undefined;
				if (currentUserId) {
					const listQuery = getUserListQuery(currentUserId);
					await queryClient.prefetchQuery(listQuery);
					const queryState = queryClient.getQueryState(listQuery.queryKey);
					if (queryState?.error) {
						await reportError(queryState.error);
					}
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/comments] route.loader() failed — no server running at build time.",
					);
				} else {
					const currentUserId =
						typeof context.currentUserId === "string"
							? context.currentUserId
							: undefined;
					if (currentUserId) {
						const errToStore = createSanitizedSSRLoaderError();
						await queryClient.prefetchQuery({
							queryKey: getUserListQuery(currentUserId).queryKey,
							queryFn: () => {
								throw errToStore;
							},
							retry: false,
						});
					}
				}
				await reportError(error);
			}
		}
	};
}

function createCommentsRouteMeta(
	config: ResolvedCommentsClientConfig,
	path: "/comments/moderation" | "/comments",
	title: string,
	description: string,
) {
	return () => {
		const fullUrl = `${config.siteBaseURL}${config.siteBasePath}${path}`;
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "noindex, nofollow" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		];
	};
}

/**
 * Comments client plugin — registers admin moderation routes.
 *
 * Embeddable `CommentThread` and `CommentCount` components consume this
 * registered plugin's browser-safe runtime through `StackProvider`.
 */
function createResolvedCommentsPlugin(config: ResolvedCommentsClientConfig) {
	return {
		routes: () =>
			defineRoutes({
				moderation: defineRoute("/comments/moderation", {
					page: ModerationPageComponent,
					loader: createModerationLoader(config),
					meta: createCommentsRouteMeta(
						config,
						"/comments/moderation",
						"Comment Moderation",
						"Review and manage comments across all resources.",
					),
				}),
				userComments: defineRoute("/comments", {
					page: UserCommentsPageComponent,
					loader: createUserCommentsLoader(config),
					meta: createCommentsRouteMeta(
						config,
						"/comments",
						"User Comments",
						"View and manage your comments across resources.",
					),
				}),
			}),
	};
}

export const commentsClientPlugin = (config: CommentsClientConfig = {}) =>
	defineClientPlugin<CommentsPluginOverrides>()({
		id: COMMENTS_PLUGIN_ID,
		resolve: (runtime) =>
			createResolvedCommentsPlugin(
				resolveCommentsClientConfig(config, runtime),
			),
	});
