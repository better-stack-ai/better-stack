import {
	defineClientPlugin,
	createApiClient,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { AiChatApiRouter } from "../api";
import { createAiChatQueryKeys } from "../query-keys";
import type { SerializedConversation, SerializedMessage } from "../types";
import { ChatLayout } from "./components/chat-layout";
import type { AiChatMode } from "./overrides";

/**
 * Context passed to route hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "abc123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: any;
}

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "abc123" }) */
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
	[key: string]: any;
}

/**
 * Configuration for AI Chat client plugin
 */
export interface AiChatClientConfig {
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

	/**
	 * Plugin mode - should match backend config
	 * - 'authenticated': Full chat with conversation history (default)
	 * - 'public': Simple widget mode, no persistence, no sidebar
	 * @default 'authenticated'
	 */
	mode?: AiChatMode;

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
	hooks?: AiChatClientHooks;

	/** Optional headers for SSR (e.g., forwarding cookies) */
	headers?: Headers;
}

/**
 * Hooks for AI Chat client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface AiChatClientHooks {
	/**
	 * Called before loading conversations list. Return false to cancel loading.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadConversations?: (
		context: LoaderContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after conversations are loaded. Return false to cancel further processing.
	 * @param conversations - Array of loaded conversations or null
	 * @param context - Loader context
	 */
	afterLoadConversations?: (
		conversations: SerializedConversation[] | null,
		context: LoaderContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before loading a single conversation. Return false to cancel loading.
	 * @param id - Conversation ID being loaded
	 * @param context - Loader context
	 */
	beforeLoadConversation?: (
		id: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after a conversation is loaded. Return false to cancel further processing.
	 * @param conversation - Loaded conversation or null if not found
	 * @param id - Conversation ID that was requested
	 * @param context - Loader context
	 */
	afterLoadConversation?: (
		conversation:
			| (SerializedConversation & { messages: SerializedMessage[] })
			| null,
		id: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called when a loading error occurs
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

// Loader for chat home page (list conversations)
function createConversationsLoader(config: AiChatClientConfig) {
	return async () => {
		// Skip loading in public mode - no persistence
		if (config.mode === "public") {
			return;
		}

		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: "/chat",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook
				if (hooks?.beforeLoadConversations) {
					const canLoad = await hooks.beforeLoadConversations(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadConversations hook");
					}
				}

				const client = createApiClient<AiChatApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				const queries = createAiChatQueryKeys(client, headers);
				const listQuery = queries.conversations.list();

				await queryClient.prefetchQuery(listQuery);

				// After hook
				if (hooks?.afterLoadConversations) {
					const conversations =
						queryClient.getQueryData<SerializedConversation[]>(
							listQuery.queryKey,
						) || null;
					const canContinue = await hooks.afterLoadConversations(
						conversations,
						context,
					);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadConversations hook");
					}
				}

				// Check for errors
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Loader for single conversation page
function createConversationLoader(id: string, config: AiChatClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: `/chat/${id}`,
				params: { id },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook
				if (hooks?.beforeLoadConversation) {
					const canLoad = await hooks.beforeLoadConversation(id, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadConversation hook");
					}
				}

				const client = createApiClient<AiChatApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				const queries = createAiChatQueryKeys(client, headers);

				// Prefetch both the conversation and the conversations list
				const conversationQuery = queries.conversations.detail(id);
				const listQuery = queries.conversations.list();

				await Promise.all([
					queryClient.prefetchQuery(conversationQuery),
					queryClient.prefetchQuery(listQuery),
				]);

				// After hook
				if (hooks?.afterLoadConversation) {
					const conversation =
						queryClient.getQueryData<
							SerializedConversation & { messages: SerializedMessage[] }
						>(conversationQuery.queryKey) || null;
					const canContinue = await hooks.afterLoadConversation(
						conversation,
						id,
						context,
					);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadConversation hook");
					}
				}

				// Check for errors
				const queryState = queryClient.getQueryState(
					conversationQuery.queryKey,
				);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Meta generator for chat home page
function createChatHomeMeta(config: AiChatClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath, seo } = config;
		const fullUrl = `${siteBaseURL}${siteBasePath}/chat`;
		const title = "Chat";
		const description = seo?.description || "Start a conversation with AI";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "noindex, nofollow" }, // Chat pages typically shouldn't be indexed

			// Open Graph
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

			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		];
	};
}

// Meta generator for single conversation page
function createConversationMeta(id: string, config: AiChatClientConfig) {
	return () => {
		const {
			queryClient,
			apiBaseURL,
			apiBasePath,
			siteBaseURL,
			siteBasePath,
			seo,
		} = config;
		const queries = createAiChatQueryKeys(
			createApiClient<AiChatApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			}),
		);

		const conversation = queryClient.getQueryData<
			SerializedConversation & { messages: SerializedMessage[] }
		>(queries.conversations.detail(id).queryKey);

		const fullUrl = `${siteBaseURL}${siteBasePath}/chat/${id}`;
		const title = conversation?.title || "Chat";
		const description = seo?.description || "AI conversation";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "noindex, nofollow" },

			// Open Graph
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),

			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

/**
 * AI Chat client plugin
 * Provides routes, components, and React Query hooks for AI chat
 *
 * @param config - Configuration including queryClient, baseURL, and optional hooks
 */
export const aiChatClientPlugin = (config: AiChatClientConfig) => {
	const isPublicMode = config.mode === "public";

	// Define routes based on mode
	// In public mode, only the base chat route is available
	// In authenticated mode, conversation routes are also available
	if (isPublicMode) {
		return defineClientPlugin({
			name: "ai-chat",

			routes: () => ({
				// Chat home - simple chat interface without history
				chat: createRoute("/chat", () => ({
					PageComponent: () => (
						<ChatLayout
							apiBaseURL={config.apiBaseURL}
							apiBasePath={config.apiBasePath}
							showSidebar={false}
						/>
					),
					loader: createConversationsLoader(config),
					meta: createChatHomeMeta(config),
				})),
			}),

			sitemap: async () => [],
		});
	}

	// Authenticated mode - full chat with conversation history
	return defineClientPlugin({
		name: "ai-chat",

		routes: () => ({
			// Chat home - new conversation or list
			chat: createRoute("/chat", () => ({
				PageComponent: () => (
					<ChatLayout
						apiBaseURL={config.apiBaseURL}
						apiBasePath={config.apiBasePath}
					/>
				),
				loader: createConversationsLoader(config),
				meta: createChatHomeMeta(config),
			})),

			// Existing conversation
			chatConversation: createRoute("/chat/:id", ({ params }) => ({
				PageComponent: () => (
					<ChatLayout
						apiBaseURL={config.apiBaseURL}
						apiBasePath={config.apiBasePath}
						conversationId={params.id}
					/>
				),
				loader: createConversationLoader(params.id, config),
				meta: createConversationMeta(params.id, config),
			})),
		}),

		// Chat pages typically shouldn't be in sitemap, but we provide the option
		sitemap: async () => {
			// Return empty array - chat conversations are private and shouldn't be indexed
			return [];
		},
	});
};

export type { SerializedConversation, SerializedMessage } from "../types";
export type { AiChatMode } from "./overrides";
