// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";

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
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * Configuration for the Comments client plugin
 */
export interface CommentsClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client instance */
	queryClient: QueryClient;
	/** Optional headers for SSR */
	headers?: Headers;
	/** Optional lifecycle hooks */
	hooks?: CommentsClientHooks;
}

function createModerationLoader(config: CommentsClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/comments/moderation",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			try {
				if (hooks?.beforeLoadModeration) {
					await hooks.beforeLoadModeration(context);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/comments] route.loader() failed — no server running at build time.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

function createUserCommentsLoader(config: CommentsClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/comments",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			try {
				if (hooks?.beforeLoadUserComments) {
					await hooks.beforeLoadUserComments(context);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/comments] route.loader() failed — no server running at build time.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

function createCommentsRouteMeta(
	config: CommentsClientConfig,
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
 * The embeddable `CommentThread` and `CommentCount` components are standalone
 * and do not require this plugin to be registered. Register them manually
 * via the layout overrides pattern or use them directly in your pages.
 */
export const commentsClientPlugin = (config: CommentsClientConfig) =>
	defineClientPlugin({
		name: "comments",

		routes: () => ({
			moderation: createRoute("/comments/moderation", () => ({
				PageComponent: ModerationPageComponent,
				loader: createModerationLoader(config),
				meta: createCommentsRouteMeta(
					config,
					"/comments/moderation",
					"Comment Moderation",
					"Review and manage comments across all resources.",
				),
			})),
			userComments: createRoute("/comments", () => ({
				PageComponent: UserCommentsPageComponent,
				loader: createUserCommentsLoader(config),
				meta: createCommentsRouteMeta(
					config,
					"/comments",
					"User Comments",
					"View and manage your comments across resources.",
				),
			})),
		}),
	});
