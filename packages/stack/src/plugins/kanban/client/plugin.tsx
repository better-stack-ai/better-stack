import {
	defineClientPlugin,
	createApiClient,
	isErrorResponse,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { normalizePath } from "@btst/stack/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { ComponentType } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { KanbanApiRouter } from "../api";
import {
	createKanbanQueryKeys,
	type KanbanIdentityPartition,
} from "../query-keys";
import type {
	SerializedBoardSummary,
	SerializedBoardWithColumns,
} from "../types";
import { BoardsListPageComponent } from "./components/pages/boards-list-page";
import { NewBoardPageComponent } from "./components/pages/new-board-page";
import { BoardPageComponent } from "./components/pages/board-page";
import { createSanitizedSSRLoaderError } from "../../utils";
import { KANBAN_PLUGIN_ID } from "./constants";
import type { KanbanPluginOverrides } from "./overrides";

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

	/** Identity snapshot used to align protected SSR prefetch and browser keys. */
	identityPartition?: KanbanIdentityPartition;

	/**
	 * Optional page component overrides.
	 * Replace any plugin page with a custom React component.
	 * The built-in component is used as the fallback when not provided.
	 */
	pageComponents?: {
		/** Replaces the boards list page */
		boards?: ComponentType;
		/** Replaces the new board page */
		newBoard?: ComponentType;
		/** Replaces the board detail page */
		board?: ComponentType<{ params: { boardId: string } }>;
	};
}

/**
 * Hooks for kanban client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface KanbanClientHooks {
	/**
	 * Called before loading boards list. Throw an error to cancel loading.
	 */
	beforeLoadBoards?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called after boards are loaded. Throw an error to cancel further processing.
	 */
	afterLoadBoards?: (
		boards: SerializedBoardSummary[] | null,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called before loading a single board. Throw an error to cancel loading.
	 */
	beforeLoadBoard?: (
		boardId: string,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called after a board is loaded. Throw an error to cancel further processing.
	 */
	afterLoadBoard?: (
		board: SerializedBoardWithColumns | null,
		boardId: string,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called before loading the new board page. Throw an error to cancel.
	 */
	beforeLoadNewBoard?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called after the new board page is loaded. Throw an error to cancel.
	 */
	afterLoadNewBoard?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called once to report a loading error. Router error handling remains authoritative.
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

interface ResolvedKanbanClientConfig extends KanbanClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveKanbanClientConfig(
	config: KanbanClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof KANBAN_PLUGIN_ID>,
): ResolvedKanbanClientConfig {
	return {
		seo: config.seo,
		hooks: config.hooks,
		identityPartition: config.identityPartition,
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

function createKanbanApiClient(config: ResolvedKanbanClientConfig) {
	return createApiClient<KanbanApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: KanbanClientHooks | undefined,
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

// Loader for SSR prefetching - boards list
function createBoardsLoader(config: ResolvedKanbanClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const {
				queryClient,
				apiBasePath,
				apiBaseURL,
				hooks,
				headers,
				identityPartition,
			} = config;

			const context: LoaderContext = {
				path: "/kanban",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createKanbanQueryKeys(createKanbanApiClient(config));
			const listQuery = queries.boards.list({}, identityPartition);

			try {
				if (hooks?.beforeLoadBoards) {
					await hooks.beforeLoadBoards(context);
				}

				await queryClient.prefetchQuery(listQuery);

				if (hooks?.afterLoadBoards) {
					const boards = queryClient.getQueryData<SerializedBoardSummary[]>(
						listQuery.queryKey,
					);
					await hooks.afterLoadBoards(boards || null, context);
				}

				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					await reportError(queryState.error);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/kanban] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.kanban.prefetchForRoute() for SSG data prefetching.",
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

// Loader for SSR prefetching - single board
function createBoardLoader(
	boardId: string,
	config: ResolvedKanbanClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const {
				queryClient,
				apiBasePath,
				apiBaseURL,
				hooks,
				headers,
				identityPartition,
			} = config;

			const context: LoaderContext = {
				path: `/kanban/${boardId}`,
				params: { boardId },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createKanbanQueryKeys(createKanbanApiClient(config));
			const boardQuery = queries.boards.detail(boardId, identityPartition);

			try {
				if (hooks?.beforeLoadBoard) {
					await hooks.beforeLoadBoard(boardId, context);
				}

				await queryClient.prefetchQuery(boardQuery);

				if (hooks?.afterLoadBoard) {
					const board = queryClient.getQueryData<SerializedBoardWithColumns>(
						boardQuery.queryKey,
					);
					await hooks.afterLoadBoard(board || null, boardId, context);
				}

				const queryState = queryClient.getQueryState(boardQuery.queryKey);
				if (queryState?.error) {
					await reportError(queryState.error);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/kanban] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.kanban.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: boardQuery.queryKey,
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

// Loader for new board page
function createNewBoardLoader(config: ResolvedKanbanClientConfig) {
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
			const reportError = createLoadErrorReporter(hooks, context);

			try {
				if (hooks?.beforeLoadNewBoard) {
					await hooks.beforeLoadNewBoard(context);
				}

				if (hooks?.afterLoadNewBoard) {
					await hooks.afterLoadNewBoard(context);
				}
			} catch (error) {
				await reportError(error);
			}
		}
	};
}

// Meta generators
function createBoardsListMeta(config: ResolvedKanbanClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath, seo } = config;
		const fullUrl = `${siteBaseURL}${normalizePath(
			[siteBasePath, "kanban"].join("/"),
		)}`;
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

function createBoardMeta(boardId: string, config: ResolvedKanbanClientConfig) {
	return () => {
		const { queryClient, siteBaseURL, siteBasePath, seo, identityPartition } =
			config;
		const queries = createKanbanQueryKeys(createKanbanApiClient(config));
		const board = queryClient.getQueryData<SerializedBoardWithColumns>(
			queries.boards.detail(boardId, identityPartition).queryKey,
		);

		if (!board) {
			return [
				{ title: "Board Not Found" },
				{ name: "robots", content: "noindex" },
			];
		}

		const fullUrl = `${siteBaseURL}${normalizePath(
			[siteBasePath, "kanban", board.id].join("/"),
		)}`;
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

function createNewBoardMeta(config: ResolvedKanbanClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath } = config;
		const fullUrl = `${siteBaseURL}${normalizePath(
			[siteBasePath, "kanban", "new"].join("/"),
		)}`;
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
function createResolvedKanbanPlugin(config: ResolvedKanbanClientConfig) {
	return {
		routes: () =>
			defineRoutes(
				{
					boards: defineRoute("/kanban", {
						page: BoardsListPageComponent,
						loader: createBoardsLoader(config),
						meta: createBoardsListMeta(config),
					}),
					newBoard: defineRoute("/kanban/new", {
						page: NewBoardPageComponent,
						loader: createNewBoardLoader(config),
						meta: createNewBoardMeta(config),
					}),
					board: defineRoute("/kanban/:boardId", {
						page: ({ params }) => (
							<BoardPageComponent boardId={params.boardId} />
						),
						loader: ({ params }) => createBoardLoader(params.boardId, config)(),
						meta: ({ params }) => createBoardMeta(params.boardId, config)(),
					}),
				},
				{ pages: config.pageComponents },
			),

		sitemap: async () => {
			const origin = `${config.siteBaseURL}${normalizePath(
				config.siteBasePath,
			)}`.replace(/\/$/, "");
			const indexUrl = `${origin}/kanban`;

			const client = createKanbanApiClient(config);

			try {
				const res = await client("/boards", {
					method: "GET",
					query: { limit: 100 },
				});
				if (isErrorResponse(res)) return [];
				// /boards returns BoardListResult { items, total, limit, offset }
				const boards = ((res.data as any)?.items ??
					[]) as SerializedBoardSummary[];
				return [
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
			} catch {
				// Protected-by-default Kanban routes are absent from anonymous sitemaps.
				return [];
			}
		},
	};
}

export const kanbanClientPlugin = (config: KanbanClientConfig = {}) =>
	defineClientPlugin<KanbanPluginOverrides>()({
		id: KANBAN_PLUGIN_ID,
		resolve: (runtime) =>
			createResolvedKanbanPlugin(resolveKanbanClientConfig(config, runtime)),
	});
