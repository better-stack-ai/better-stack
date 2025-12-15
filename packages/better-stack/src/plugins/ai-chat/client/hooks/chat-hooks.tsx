"use client";

import { createApiClient } from "@btst/stack/plugins/client";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import type { AiChatApiRouter } from "../../api/plugin";
import {
	createAiChatQueryKeys,
	type ConversationWithMessages,
} from "../../query-keys";
import type { SerializedConversation, SerializedMessage } from "../../types";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";

/**
 * Shared React Query configuration for all chat queries
 * Prevents automatic refetching to avoid hydration mismatches in SSR
 */
const SHARED_QUERY_CONFIG = {
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	refetchOnReconnect: false,
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 10, // 10 minutes
} as const;

/**
 * Options for the useConversations hook
 */
export interface UseConversationsOptions {
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Result from the useConversations hook
 */
export interface UseConversationsResult {
	/** Array of conversations */
	conversations: SerializedConversation[];
	/** Whether the initial load is in progress */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to refetch the conversations */
	refetch: () => void;
}

/**
 * Hook for fetching all conversations
 */
export function useConversations(
	options: UseConversationsOptions = {},
): UseConversationsResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const { enabled = true } = options;
	const queries = createAiChatQueryKeys(client, headers);

	const listQuery = queries.conversations.list();

	const { data, isLoading, error, refetch } = useQuery<
		SerializedConversation[],
		Error,
		SerializedConversation[],
		typeof listQuery.queryKey
	>({
		...listQuery,
		...SHARED_QUERY_CONFIG,
		enabled: enabled && !!client,
	});

	return {
		conversations: data ?? [],
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useConversations
 */
export function useSuspenseConversations(): {
	conversations: SerializedConversation[];
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createAiChatQueryKeys(client, headers);
	const listQuery = queries.conversations.list();

	const { data, refetch, error, isFetching } = useSuspenseQuery<
		SerializedConversation[],
		Error,
		SerializedConversation[],
		typeof listQuery.queryKey
	>({
		...listQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		conversations: data ?? [],
		refetch,
	};
}

/**
 * Options for the useConversation hook
 */
export interface UseConversationOptions {
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Result from the useConversation hook
 */
export interface UseConversationResult {
	/** The conversation with messages, or null if not found */
	conversation: ConversationWithMessages | null;
	/** Whether the conversation is being loaded */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to refetch the conversation */
	refetch: () => void;
}

/**
 * Hook for fetching a single conversation with messages
 */
export function useConversation(
	id?: string,
	options: UseConversationOptions = {},
): UseConversationResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const { enabled = true } = options;
	const queries = createAiChatQueryKeys(client, headers);

	const detailQuery = queries.conversations.detail(id ?? "");

	const { data, isLoading, error, refetch } = useQuery<
		ConversationWithMessages | null,
		Error,
		ConversationWithMessages | null,
		typeof detailQuery.queryKey
	>({
		...detailQuery,
		...SHARED_QUERY_CONFIG,
		enabled: enabled && !!client && !!id,
	});

	return {
		conversation: data || null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useConversation
 */
export function useSuspenseConversation(id: string): {
	conversation: ConversationWithMessages | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createAiChatQueryKeys(client, headers);
	const detailQuery = queries.conversations.detail(id);

	const { data, refetch, error, isFetching } = useSuspenseQuery<
		ConversationWithMessages | null,
		Error,
		ConversationWithMessages | null,
		typeof detailQuery.queryKey
	>({
		...detailQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		conversation: data || null,
		refetch,
	};
}

/**
 * Hook for creating a new conversation
 */
export function useCreateConversation() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createAiChatQueryKeys(client);

	return useMutation<
		SerializedConversation | null,
		Error,
		{ id?: string; title?: string }
	>({
		mutationKey: [...queries.conversations._def, "create"],
		mutationFn: async (data) => {
			const response = await client("@post/chat/conversations", {
				method: "POST",
				body: data,
			});
			return response.data as SerializedConversation | null;
		},
		onSuccess: async (created) => {
			// Update list cache
			await queryClient.invalidateQueries({
				queryKey: queries.conversations.list().queryKey,
			});
			// Refresh server-side cache if available
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for renaming a conversation
 */
export function useRenameConversation() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createAiChatQueryKeys(client);

	return useMutation<
		SerializedConversation | null,
		Error,
		{ id: string; title: string }
	>({
		mutationKey: [...queries.conversations._def, "rename"],
		mutationFn: async ({ id, title }) => {
			const response = await client("@put/chat/conversations/:id", {
				method: "PUT",
				params: { id },
				body: { title },
			});
			return response.data as SerializedConversation | null;
		},
		onSuccess: async (updated) => {
			// Update detail cache if available
			if (updated?.id) {
				queryClient.setQueryData(
					queries.conversations.detail(updated.id).queryKey,
					(old: ConversationWithMessages | null | undefined) =>
						old ? { ...old, ...updated } : null,
				);
			}
			// Invalidate list
			await queryClient.invalidateQueries({
				queryKey: queries.conversations.list().queryKey,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for deleting a conversation
 */
export function useDeleteConversation() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<AiChatPluginOverrides>("ai-chat");
	const client = createApiClient<AiChatApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createAiChatQueryKeys(client);

	return useMutation<{ success: boolean }, Error, { id: string }>({
		mutationKey: [...queries.conversations._def, "delete"],
		mutationFn: async ({ id }) => {
			const response = await client("@delete/chat/conversations/:id", {
				method: "DELETE",
				params: { id },
			});
			return response.data as { success: boolean };
		},
		onSuccess: async (_, { id }) => {
			// Remove from detail cache
			queryClient.removeQueries({
				queryKey: queries.conversations.detail(id).queryKey,
			});
			// Invalidate list
			await queryClient.invalidateQueries({
				queryKey: queries.conversations.list().queryKey,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

export type {
	SerializedConversation,
	SerializedMessage,
	ConversationWithMessages,
};
