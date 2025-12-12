import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { AiChatApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type { SerializedConversation, SerializedMessage } from "./types";

// Helper to check and handle error responses
function handleResponse<T>(response: unknown): T {
	if (
		typeof response === "object" &&
		response !== null &&
		"error" in response
	) {
		const errorResponse = response as { error?: unknown };
		if (errorResponse.error !== null && errorResponse.error !== undefined) {
			const error = errorResponse.error;
			if (error instanceof Error) {
				throw error;
			}
			if (typeof error === "object" && error !== null) {
				const errorObj = error as Record<string, unknown>;
				const message =
					(typeof errorObj.message === "string" ? errorObj.message : null) ||
					(typeof errorObj.error === "string" ? errorObj.error : null) ||
					JSON.stringify(error);
				throw new Error(message);
			}
			throw new Error(String(error));
		}
	}
	return (response as { data?: T }).data as T;
}

export type ConversationWithMessages = SerializedConversation & {
	messages: SerializedMessage[];
};

export function createAiChatQueryKeys(
	client: ReturnType<typeof createApiClient<AiChatApiRouter>>,
	headers?: HeadersInit,
) {
	const conversations = createConversationsQueries(client, headers);

	return mergeQueryKeys(conversations);
}

function createConversationsQueries(
	client: ReturnType<typeof createApiClient<AiChatApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("conversations", {
		// List all conversations
		list: () => ({
			// NOTE: query-key-factory already namespaces as:
			// ["conversations", "list", ...queryKey]
			// so we use a stable marker (not "list") to avoid ["...","list","list"].
			queryKey: ["all"],
			queryFn: async () => {
				const response = await client("/conversations", {
					method: "GET",
					headers,
				});

				const data = handleResponse<SerializedConversation[] | null>(response);
				return data ?? [];
			},
		}),

		// Get single conversation with messages
		detail: (id: string) => ({
			queryKey: [id],
			queryFn: async () => {
				if (!id) return null;

				const response = await client("/conversations/:id", {
					method: "GET",
					params: { id },
					headers,
				});

				return handleResponse<ConversationWithMessages | null>(response);
			},
		}),
	});
}
