import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { KanbanApiRouter } from "../api";
import { createKanbanQueryKeys } from "../query-keys";
import type { SerializedBoardWithColumns } from "../types";
import { BoardsListPageComponent } from "./components/pages/boards-list-page";
import { NewBoardPageComponent } from "./components/pages/new-board-page";
import { BoardPageComponent } from "./components/pages/board-page";

/**
 * Context passed to route hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { boardId: "abc123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

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
 * Configuration for kanban client plugin
 */
export interface KanbanClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site for SEO meta tags */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client instance for caching */
	queryClient: QueryClient;

	/** Optional SEO configuration for meta tags */
	seo?: {
		/** Site name for Open Graph tags */
		siteName?: string;
		/** Default description */
		description?: string;
		/** Locale for Open Graph (e.g., "en_US") */
		locale?: string;
		/** Default image URL for social sharing */
		defaultImage?: string;
	};

	/** Optional hooks for customizing behavior */
	hooks?: KanbanClientHooks;

	/** Optional headers for SSR (e.g., forwarding cookies) */
	headers?: Headers;
}

/**
 * Hooks for kanban client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface KanbanClientHooks {
	/**
	 * Called before loading boards list. Return false to cancel loading.
	 */
	beforeLoadBoards?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called after boards are loaded. Return false to cancel further processing.
	 */
	afterLoadBoards?: (
		boards: SerializedBoardWithColumns[] | null,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before loading a single board. Return false to cancel loading.
	 */
	beforeLoadBoard?: (
		boardId: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after a board is loaded. Return false to cancel further processing.
	 */
	afterLoadBoard?: (
		board: SerializedBoardWithColumns | null,
		boardId: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before loading the new board page. Return false to cancel.
	 */
	beforeLoadNewBoard?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called after the new board page is loaded. Return false to cancel.
	 */
	afterLoadNewBoard?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called when a loading error occurs
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

// Loader for SSR prefetching - boards list
function createBoardsLoader(config: KanbanClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: "/kanban",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				if (hooks?.beforeLoadBoards) {
					const canLoad = await hooks.beforeLoadBoards(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadBoards hook");
					}
				}

				const client = createApiClient<KanbanApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				const queries = createKanbanQueryKeys(client, headers);
				const listQuery = queries.boards.list({});

				await queryClient.prefetchQuery(listQuery);

				if (hooks?.afterLoadBoards) {
					const boards = queryClient.getQueryData<SerializedBoardWithColumns[]>(
						listQuery.queryKey,
					);
					const canContinue = await hooks.afterLoadBoards(
						boards || null,
						context,
					);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadBoards hook");
					}
				}

				const queryState = queryClient.getQueryState(listQuery.queryKey);
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
						"[btst/kanban] route.loader() failed — no server running at build time. " +
							"Use myStack.api.kanban.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Loader for SSR prefetching - single board
function createBoardLoader(boardId: string, config: KanbanClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: `/kanban/${boardId}`,
				params: { boardId },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				if (hooks?.beforeLoadBoard) {
					const canLoad = await hooks.beforeLoadBoard(boardId, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadBoard hook");
					}
				}

				const client = createApiClient<KanbanApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				const queries = createKanbanQueryKeys(client, headers);
				const boardQuery = queries.boards.detail(boardId);
				await queryClient.prefetchQuery(boardQuery);

				if (hooks?.afterLoadBoard) {
					const board = queryClient.getQueryData<SerializedBoardWithColumns>(
						boardQuery.queryKey,
					);
					const canContinue = await hooks.afterLoadBoard(
						board || null,
						boardId,
						context,
					);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadBoard hook");
					}
				}

				const queryState = queryClient.getQueryState(boardQuery.queryKey);
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
						"[btst/kanban] route.loader() failed — no server running at build time. " +
							"Use myStack.api.kanban.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Loader for new board page
function createNewBoardLoader(config: KanbanClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: "/kanban/new",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				if (hooks?.beforeLoadNewBoard) {
					const canLoad = await hooks.beforeLoadNewBoard(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadNewBoard hook");
					}
				}

				if (hooks?.afterLoadNewBoard) {
					const canContinue = await hooks.afterLoadNewBoard(context);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadNewBoard hook");
					}
				}
			} catch (error) {
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Meta generators
function createBoardsListMeta(config: KanbanClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath, seo } = config;
		const fullUrl = `${siteBaseURL}${siteBasePath}/kanban`;
		const title = "Kanban Boards";
		const description =
			seo?.description || "Manage your projects with kanban boards";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "index, follow" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),
			...(seo?.locale ? [{ property: "og:locale", content: seo.locale }] : []),
			...(seo?.defaultImage
				? [{ property: "og:image", content: seo.defaultImage }]
				: []),
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		];
	};
}

function createBoardMeta(boardId: string, config: KanbanClientConfig) {
	return () => {
		const {
			queryClient,
			apiBaseURL,
			apiBasePath,
			siteBaseURL,
			siteBasePath,
			seo,
		} = config;
		const queries = createKanbanQueryKeys(
			createApiClient<KanbanApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			}),
		);
		const board = queryClient.getQueryData<SerializedBoardWithColumns>(
			queries.boards.detail(boardId).queryKey,
		);

		if (!board) {
			return [
				{ title: "Board Not Found" },
				{ name: "robots", content: "noindex" },
			];
		}

		const fullUrl = `${siteBaseURL}${siteBasePath}/kanban/${board.id}`;
		const title = board.name;
		const description = board.description || `Kanban board: ${board.name}`;

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "index, follow" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),
			...(seo?.defaultImage
				? [{ property: "og:image", content: seo.defaultImage }]
				: []),
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

function createNewBoardMeta(config: KanbanClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath } = config;
		const fullUrl = `${siteBaseURL}${siteBasePath}/kanban/new`;
		const title = "Create New Board";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: "Create a new kanban board" },
			{ name: "robots", content: "noindex, nofollow" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:url", content: fullUrl },
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

/**
 * Kanban client plugin
 * Provides routes, components, and React Query hooks for kanban boards
 */
export const kanbanClientPlugin = (config: KanbanClientConfig) =>
	defineClientPlugin({
		name: "kanban",

		routes: () => ({
			boards: createRoute("/kanban", () => {
				return {
					PageComponent: () => <BoardsListPageComponent />,
					loader: createBoardsLoader(config),
					meta: createBoardsListMeta(config),
				};
			}),
			newBoard: createRoute("/kanban/new", () => {
				return {
					PageComponent: NewBoardPageComponent,
					loader: createNewBoardLoader(config),
					meta: createNewBoardMeta(config),
				};
			}),
			board: createRoute("/kanban/:boardId", ({ params: { boardId } }) => {
				return {
					PageComponent: () => <BoardPageComponent boardId={boardId} />,
					loader: createBoardLoader(boardId, config),
					meta: createBoardMeta(boardId, config),
				};
			}),
		}),

		sitemap: async () => {
			const origin = `${config.siteBaseURL}${config.siteBasePath}`;
			const indexUrl = `${origin}/kanban`;

			const client = createApiClient<KanbanApiRouter>({
				baseURL: config.apiBaseURL,
				basePath: config.apiBasePath,
			});

			let boards: SerializedBoardWithColumns[] = [];
			try {
				const res = await client("/boards", {
					method: "GET",
					query: { limit: 100 },
				});
				// /boards returns BoardListResult { items, total, limit, offset }
				boards = ((res.data as any)?.items ??
					[]) as SerializedBoardWithColumns[];
			} catch {
				// Ignore errors for sitemap
			}

			const entries = [
				{
					url: indexUrl,
					lastModified: new Date(),
					changeFrequency: "daily" as const,
					priority: 0.7,
				},
				...boards.map((b) => ({
					url: `${origin}/kanban/${b.id}`,
					lastModified: b.updatedAt ? new Date(b.updatedAt) : undefined,
					changeFrequency: "weekly" as const,
					priority: 0.6,
				})),
			];

			return entries;
		},
	});
