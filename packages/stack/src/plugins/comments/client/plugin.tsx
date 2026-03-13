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

const MyCommentsPageComponent = lazy(() =>
	import("./components/pages/my-comments-page").then((m) => ({
		default: m.MyCommentsPageComponent,
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
	 * Called before loading the My Comments page. Throw to cancel.
	 */
	beforeLoadMyComments?: (context: LoaderContext) => Promise<void> | void;
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

function createMyCommentsLoader(config: CommentsClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { apiBasePath, apiBaseURL, headers, hooks } = config;
			const context: LoaderContext = {
				path: "/comments/my-comments",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			try {
				if (hooks?.beforeLoadMyComments) {
					await hooks.beforeLoadMyComments(context);
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
				meta: () => [{ title: "Comment Moderation" }],
			})),
			myComments: createRoute("/comments/my-comments", () => ({
				PageComponent: MyCommentsPageComponent,
				loader: createMyCommentsLoader(config),
				meta: () => [{ title: "My Comments" }],
			})),
		}),
	});
