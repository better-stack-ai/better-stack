import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { AiChatApiRouter } from "./api/plugin";
import type { StackIdentity } from "@btst/stack/context";
import type { SerializedConversation, SerializedMessage } from "./types";

/** Identity partition for protected AI Chat history caches. */
export type AiChatIdentityPartition =
	| Pick<StackIdentity, "id">
	| "anonymous"
	| `pending:${number}`
	| `error:${number}`;

function identityKey(identityPartition: AiChatIdentityPartition) {
	return typeof identityPartition === "string"
		? identityPartition
		: { id: identityPartition.id };
}

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
				key: (identityPartition?: AiChatIdentityPartition) =>
					identityPartition === undefined
						? ["all"]
						: ["all", { identity: identityKey(identityPartition) }],
				select: (
					data: any,
					_identityPartition?: AiChatIdentityPartition,
				): SerializedConversation[] => data ?? [],
			},
			detail: {
				path: "/chat/conversations/:id",
				params: (id: string, _identityPartition?: AiChatIdentityPartition) => ({
					id,
				}),
				key: (id: string, identityPartition?: AiChatIdentityPartition) =>
					identityPartition === undefined
						? [id]
						: [id, { identity: identityKey(identityPartition) }],
				select: (
					data: any,
					_id?: string,
					_identityPartition?: AiChatIdentityPartition,
				): ConversationWithMessages | null => data,
				skip: (id: string, _identityPartition?: AiChatIdentityPartition) => !id,
			},
		},
		mutations: {
			create: {
				path: "@post/chat/conversations",
				method: "POST" as const,
				input: (input: CreateConversationInput) => ({ body: input }),
				select: (data: any): SerializedConversation | null => data,
				refresh: false,
			},
			rename: {
				path: "@put/chat/conversations/:id",
				method: "PUT" as const,
				input: (input: RenameConversationInput) => ({
					params: { id: input.id },
					body: { title: input.title },
				}),
				select: (data: any): SerializedConversation | null => data,
				refresh: false,
			},
			delete: {
				path: "@delete/chat/conversations/:id",
				method: "DELETE" as const,
				input: (input: { id: string }) => ({ params: { id: input.id } }),
				select: (data: any): { success: boolean } => data,
				refresh: false,
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
