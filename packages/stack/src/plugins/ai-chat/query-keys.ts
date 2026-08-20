import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { AiChatApiRouter } from "./api/plugin";
import type { SerializedConversation, SerializedMessage } from "./types";

export type ConversationWithMessages = SerializedConversation & {
	messages: SerializedMessage[];
};

export interface CreateConversationInput {
	id?: string;
	title?: string;
}

export interface RenameConversationInput {
	id: string;
	title: string;
}

/** Single source of truth for conversation HTTP mappings and cache behavior. */
export const aiChatResources = {
	conversations: {
		queries: {
			list: {
				path: "/chat/conversations",
				key: () => ["all"],
				select: (data: any): SerializedConversation[] => data ?? [],
			},
			detail: {
				path: "/chat/conversations/:id",
				params: (id: string) => ({ id }),
				key: (id: string) => [id],
				select: (data: any): ConversationWithMessages | null => data,
				skip: (id: string) => !id,
			},
		},
		mutations: {
			create: {
				path: "@post/chat/conversations",
				method: "POST" as const,
				input: (input: CreateConversationInput) => ({ body: input }),
				select: (data: any): SerializedConversation | null => data,
				invalidates: ["conversations.list"],
			},
			rename: {
				path: "@put/chat/conversations/:id",
				method: "PUT" as const,
				input: (input: RenameConversationInput) => ({
					params: { id: input.id },
					body: { title: input.title },
				}),
				select: (data: any): SerializedConversation | null => data,
				invalidates: ["conversations.list"],
				setData: {
					args: (result: SerializedConversation | null) =>
						result?.id ? [result.id] : null,
					updater: (
						previous: unknown,
						result: SerializedConversation | null,
					) =>
						previous && result
							? { ...(previous as ConversationWithMessages), ...result }
							: previous,
				},
			},
			delete: {
				path: "@delete/chat/conversations/:id",
				method: "DELETE" as const,
				input: (input: { id: string }) => ({ params: { id: input.id } }),
				select: (data: any): { success: boolean } => data,
				invalidates: ["conversations.list"],
				removeData: {
					args: (_result: { success: boolean }, input: { id: string }) => [
						input.id,
					],
				},
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createAiChatQueryKeys(
	client: ReturnType<typeof createApiClient<AiChatApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, aiChatResources, headers);
}

export type AiChatQueryKeys = ReturnType<typeof createAiChatQueryKeys>;
