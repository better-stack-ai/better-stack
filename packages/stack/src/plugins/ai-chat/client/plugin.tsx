import {
	defineClientPlugin,
	createApiClient,
	createSanitizedSSRLoaderError,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { ComponentType } from "react";
import type { AiChatApiRouter } from "../api";
import {
	createAiChatQueryKeys,
	type AiChatIdentityPartition,
} from "../query-keys";
import type { SerializedConversation, SerializedMessage } from "../types";
import { ChatPageComponent } from "./components/pages/chat-page";
import type {
	AiChatMode,
	AiChatPluginOverrides,
	AiChatProviderConfig,
} from "./overrides";

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

	/** Identity hydrated for this SSR request's protected query partition. */
	identityPartition?: AiChatIdentityPartition;

	/**
	 * Optional page component overrides.
	 * Replace any plugin page with a custom React component.
	 * The built-in component is used as the fallback when not provided.
	 */
	pageComponents?: {
		/** Replaces the chat home page */
		chat?: ComponentType;
		/** Replaces the conversation page (authenticated mode only) */
		chatConversation?: ComponentType<{ params: { id: string } }>;
	};
}

/**
 * Hooks for AI Chat client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface AiChatClientHooks {
	/**
	 * Called before loading conversations list. Throw an error to cancel loading.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadConversations?: (context: LoaderContext) => Promise<void> | void;

	/**
	 * Called after conversations are loaded. Throw an error to cancel further processing.
	 * @param conversations - Array of loaded conversations or null
	 * @param context - Loader context
	 */
	afterLoadConversations?: (
		conversations: SerializedConversation[] | null,
		context: LoaderContext,
	) => Promise<void> | void;

	/**
	 * Called before loading a single conversation. Throw an error to cancel loading.
	 * @param id - Conversation ID being loaded
	 * @param context - Loader context
	 */
	beforeLoadConversation?: (
		id: string,
		context: LoaderContext,
	) => Promise<void> | void;

	/**
	 * Called after a conversation is loaded. Throw an error to cancel further processing.
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
	) => Promise<void> | void;

	/**
	 * Called when a loading error occurs
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

interface ResolvedAiChatClientConfig extends AiChatClientConfig {
	runtime: ResolvedClientPluginRuntime<"aiChat">;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function createLoadErrorReporter(
	hooks: AiChatClientHooks | undefined,
	context: LoaderContext,
) {
	let reported = false;
	return async (error: unknown) => {
		if (reported || !hooks?.onErrorLoad) return;
		reported = true;
		try {
			await hooks.onErrorLoad(toError(error), context);
		} catch {
			// Loader hooks cannot make an SSR loader throw or run twice.
		}
	};
}

async function seedSanitizedLoaderErrors(
	queryClient: QueryClient,
	queryKeys: readonly QueryKey[],
) {
	const errToStore = createSanitizedSSRLoaderError();
	await Promise.all(
		queryKeys.map((queryKey) =>
			queryClient.prefetchQuery({
				queryKey,
				queryFn: () => {
					throw errToStore;
				},
				retry: false,
			}),
		),
	);
}

// Loader for chat home page (list conversations)
function createConversationsLoader(config: ResolvedAiChatClientConfig) {
	return async () => {
		// Skip loading in public mode - no persistence
		if (config.mode === "public") {
			return;
		}

		if (typeof window === "undefined") {
			const { hooks, identityPartition = "anonymous", runtime } = config;
			const { api, queryClient } = runtime;

			const context: LoaderContext = {
				path: "/chat",
				isSSR: true,
				apiBaseURL: api.baseURL,
				apiBasePath: api.basePath,
				headers: api.headers,
			};
			const client = createApiClient<AiChatApiRouter>({
				baseURL: api.baseURL,
				basePath: api.basePath,
				credentials: api.credentials,
			});
			const queries = createAiChatQueryKeys(client, api.headers);
			const listQuery = queries.conversations.list(identityPartition);
			const reportError = createLoadErrorReporter(hooks, context);

			try {
				// Before hook
				if (hooks?.beforeLoadConversations) {
					await hooks.beforeLoadConversations(context);
				}

				await queryClient.prefetchQuery(listQuery);

				// After hook
				if (hooks?.afterLoadConversations) {
					const conversations =
						queryClient.getQueryData<SerializedConversation[]>(
							listQuery.queryKey,
						) || null;
					await hooks.afterLoadConversations(conversations, context);
				}

				// Check for errors
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					if (isConnectionError(queryState.error)) {
						console.warn(
							"[btst/ai-chat] route.loader() failed — no server running at build time. " +
								"AI Chat conversation history does not support SSG.",
						);
					} else {
						await seedSanitizedLoaderErrors(queryClient, [listQuery.queryKey]);
					}
					await reportError(queryState.error);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/ai-chat] route.loader() failed — no server running at build time. " +
							"AI Chat conversation history does not support SSG.",
					);
				} else {
					await seedSanitizedLoaderErrors(queryClient, [listQuery.queryKey]);
				}
				await reportError(error);
			}
		}
	};
}

// Loader for single conversation page
function createConversationLoader(
	id: string,
	config: ResolvedAiChatClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { hooks, identityPartition = "anonymous", runtime } = config;
			const { api, queryClient } = runtime;

			const context: LoaderContext = {
				path: `/chat/${id}`,
				params: { id },
				isSSR: true,
				apiBaseURL: api.baseURL,
				apiBasePath: api.basePath,
				headers: api.headers,
			};
			const client = createApiClient<AiChatApiRouter>({
				baseURL: api.baseURL,
				basePath: api.basePath,
				credentials: api.credentials,
			});
			const queries = createAiChatQueryKeys(client, api.headers);
			const conversationQuery = queries.conversations.detail(
				id,
				identityPartition,
			);
			const listQuery = queries.conversations.list(identityPartition);
			const reportError = createLoadErrorReporter(hooks, context);

			try {
				// Before hook
				if (hooks?.beforeLoadConversation) {
					await hooks.beforeLoadConversation(id, context);
				}

				// Prefetch both the conversation and the conversations list
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
					await hooks.afterLoadConversation(conversation, id, context);
				}

				// Check for errors
				const queryStates = [
					conversationQuery.queryKey,
					listQuery.queryKey,
				].map((queryKey) => ({
					queryKey,
					error: queryClient.getQueryState(queryKey)?.error,
				}));
				const failedQueries = queryStates.filter(
					(entry): entry is { queryKey: QueryKey; error: Error } =>
						entry.error != null,
				);
				const queryError = failedQueries[0]?.error;
				if (queryError) {
					const connectionFailures = failedQueries.filter(({ error }) =>
						isConnectionError(error),
					);
					const backendFailures = failedQueries.filter(
						({ error }) => !isConnectionError(error),
					);
					if (connectionFailures.length > 0) {
						console.warn(
							"[btst/ai-chat] route.loader() failed — no server running at build time. " +
								"AI Chat conversations do not support SSG.",
						);
					}
					if (backendFailures.length > 0) {
						await seedSanitizedLoaderErrors(
							queryClient,
							backendFailures.map(({ queryKey }) => queryKey),
						);
					}
					await reportError(queryError);
				}
			} catch (error) {
				if (isConnectionError(error)) {
					console.warn(
						"[btst/ai-chat] route.loader() failed — no server running at build time. " +
							"AI Chat conversations do not support SSG.",
					);
				} else {
					await seedSanitizedLoaderErrors(queryClient, [
						conversationQuery.queryKey,
						listQuery.queryKey,
					]);
				}
				await reportError(error);
			}
		}
	};
}

// Meta generator for chat home page
function createChatHomeMeta(config: ResolvedAiChatClientConfig) {
	return () => {
		const { seo, runtime } = config;
		const fullUrl = `${runtime.site.baseURL}${runtime.site.basePath}/chat`;
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
function createConversationMeta(
	id: string,
	config: ResolvedAiChatClientConfig,
) {
	return () => {
		const { seo, identityPartition = "anonymous", runtime } = config;
		const { api, queryClient, site } = runtime;
		const queries = createAiChatQueryKeys(
			createApiClient<AiChatApiRouter>({
				baseURL: api.baseURL,
				basePath: api.basePath,
				credentials: api.credentials,
			}),
		);

		const conversation = queryClient.getQueryData<
			SerializedConversation & { messages: SerializedMessage[] }
		>(queries.conversations.detail(id, identityPartition).queryKey);

		const fullUrl = `${site.baseURL}${site.basePath}/chat/${id}`;
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
 * @param config - Resolved plugin-specific configuration and stack runtime
 */
function resolveAiChatClientPlugin(config: ResolvedAiChatClientConfig) {
	const isPublicMode = config.mode === "public";

	// Define routes based on mode
	// In public mode, only the base chat route is available
	// In authenticated mode, conversation routes are also available
	if (isPublicMode) {
		return {
			routes: () =>
				defineRoutes(
					{
						// Chat home - simple chat interface without history
						chat: defineRoute("/chat", {
							page: () => <ChatPageComponent />,
							loader: createConversationsLoader(config),
							meta: createChatHomeMeta(config),
						}),
					},
					{ pages: config.pageComponents },
				),

			sitemap: async () => [],
		};
	}

	// Authenticated mode - full chat with conversation history
	return {
		routes: () =>
			defineRoutes(
				{
					// Chat home - new conversation or list
					chat: defineRoute("/chat", {
						page: () => <ChatPageComponent />,
						loader: createConversationsLoader(config),
						meta: createChatHomeMeta(config),
					}),

					// Existing conversation
					chatConversation: defineRoute("/chat/:id", {
						page: ({ params }) => (
							<ChatPageComponent conversationId={params.id} />
						),
						loader: ({ params }) =>
							createConversationLoader(params.id, config)(),
						meta: ({ params }) => createConversationMeta(params.id, config)(),
					}),
				},
				{ pages: config.pageComponents },
			),

		// Chat pages typically shouldn't be in sitemap, but we provide the option
		sitemap: async () => {
			// Return empty array - chat conversations are private and shouldn't be indexed
			return [];
		},
	};
}

/**
 * Runtime-independent AI Chat client definition. Shared API/site/query values
 * are supplied once by `createClientStack()` when the definition is resolved.
 */
export const aiChatClientPlugin = (config: AiChatClientConfig = {}) =>
	defineClientPlugin<AiChatPluginOverrides>()({
		id: "aiChat",
		providerConfig: {
			mode: config.mode ?? "authenticated",
		} satisfies AiChatProviderConfig,
		resolve: (runtime) => resolveAiChatClientPlugin({ ...config, runtime }),
	});

export type { SerializedConversation, SerializedMessage } from "../types";
export type { AiChatMode } from "./overrides";
