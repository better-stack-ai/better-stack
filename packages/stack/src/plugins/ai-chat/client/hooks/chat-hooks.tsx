"use client";

import type { ResourceFormResult } from "@btst/stack/plugins/client/hooks";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type {
	ConversationWithMessages,
	CreateConversationInput,
	RenameConversationInput,
} from "../../query-keys";
import type { SerializedConversation, SerializedMessage } from "../../types";
import type { AiChatPluginOverrides } from "../overrides";
import { aiChat } from "./ai-chat-resource";

/** Options for the useConversations hook. */
export interface UseConversationsOptions {
	/** Whether to enable the query (default: true). */
	enabled?: boolean;
}

/** Result from the useConversations hook. */
export interface UseConversationsResult {
	conversations: SerializedConversation[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

/** Fetch all conversations while preserving the legacy result shape. */
export function useConversations(
	options: UseConversationsOptions = {},
): UseConversationsResult {
	const query = aiChat.conversations.list.use([], {
		enabled: options.enabled ?? true,
	});

	return {
		conversations: query.data ?? [],
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

/** Suspense variant of useConversations. */
export function useSuspenseConversations(): {
	conversations: SerializedConversation[];
	refetch: () => Promise<unknown>;
} {
	const query = aiChat.conversations.list.useSuspense([]);
	return {
		conversations: query.data ?? [],
		refetch: query.refetch,
	};
}

/** Options for the useConversation hook. */
export interface UseConversationOptions {
	/** Whether to enable the query (default: true). */
	enabled?: boolean;
}

/** Result from the useConversation hook. */
export interface UseConversationResult {
	conversation: ConversationWithMessages | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

/** Fetch a conversation and its messages while preserving the legacy shape. */
export function useConversation(
	id?: string,
	options: UseConversationOptions = {},
): UseConversationResult {
	const query = aiChat.conversations.detail.use([id ?? ""], {
		enabled: (options.enabled ?? true) && !!id,
	});

	return {
		conversation: query.data ?? null,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

/** Suspense variant of useConversation. */
export function useSuspenseConversation(id: string): {
	conversation: ConversationWithMessages | null;
	refetch: () => Promise<unknown>;
} {
	const query = aiChat.conversations.detail.useSuspense([id]);
	return {
		conversation: query.data ?? null,
		refetch: query.refetch,
	};
}

/** Create a persisted conversation. */
export function useCreateConversation() {
	return aiChat.conversations.create.use();
}

/** Rename a persisted conversation. */
export function useRenameConversation() {
	return aiChat.conversations.rename.use();
}

/** Delete a persisted conversation. */
export function useDeleteConversation() {
	return aiChat.conversations.delete.use();
}

export interface RenameConversationFormValues {
	title: string;
}

export interface UseRenameConversationFormOptions {
	conversation: SerializedConversation | null;
	onSuccess?: (
		conversation: SerializedConversation | null,
	) => void | Promise<void>;
}

/** Form lifecycle for renaming a conversation, including field errors and notifications. */
export function useRenameConversationForm(
	options: UseRenameConversationFormOptions,
): ResourceFormResult<
	RenameConversationFormValues,
	SerializedConversation,
	SerializedConversation | null
> {
	const t = useTranslate();
	const { localization } = usePluginOverrides<AiChatPluginOverrides>("ai-chat");

	return aiChat.conversations.useForm<
		RenameConversationFormValues,
		SerializedConversation | null,
		SerializedConversation
	>({
		action: "edit",
		updateMutation: "rename",
		record: options.conversation,
		defaults: (conversation) => ({ title: conversation?.title ?? "" }),
		toUpdateVars: (values, conversation): RenameConversationInput => {
			if (!conversation) {
				throw new Error(
					t("aiChat.errors.missingConversation", "Conversation is required"),
				);
			}
			return { id: conversation.id, title: values.title.trim() };
		},
		successMessage:
			localization?.CONVERSATION_RENAME_SUCCESS ??
			t("aiChat.toasts.renameSuccess", "Conversation renamed"),
		errorMessage: (error) =>
			error.message ||
			localization?.CONVERSATION_RENAME_FAILURE ||
			t("aiChat.toasts.renameFailure", "Failed to rename conversation"),
		onSuccess: options.onSuccess,
	});
}

export type {
	ConversationWithMessages,
	CreateConversationInput,
	RenameConversationInput,
	SerializedConversation,
	SerializedMessage,
};
