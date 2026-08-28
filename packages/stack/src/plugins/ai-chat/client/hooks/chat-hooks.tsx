"use client";

import {
	hashKey,
	useQueryClient,
	type UseMutationResult,
} from "@tanstack/react-query";
import { useLayoutEffect, useRef } from "react";
import type { ResourceFormResult } from "@btst/stack/plugins/client/hooks";
import {
	useIdentity,
	useIdentityResolutionPromise,
	useIdentitySourceGeneration,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import type {
	AiChatIdentityPartition,
	ConversationWithMessages,
	CreateConversationInput,
	RenameConversationInput,
} from "../../query-keys";
import { aiChatIdentityKey } from "../../query-keys";
import type { SerializedConversation, SerializedMessage } from "../../types";
import type { AiChatPluginOverrides } from "../overrides";
import { aiChat } from "./ai-chat-resource";

function useAiChatIdentityState(): {
	partition: AiChatIdentityPartition;
	isPending: boolean;
	error?: Error;
	refetchIdentity: () => Promise<void>;
} {
	const { identity, isPending, error, refetch } = useIdentity();
	const sourceGeneration = useIdentitySourceGeneration();
	return {
		partition: isPending
			? `pending:${sourceGeneration}`
			: error
				? `error:${sourceGeneration}`
				: identity
					? identity
					: "anonymous",
		isPending,
		...(error ? { error } : {}),
		refetchIdentity: refetch,
	};
}

/** Current auth generation, used to partition protected browser caches. */
export function useAiChatIdentityPartition() {
	return useAiChatIdentityState().partition;
}

function isUnresolvedIdentityPartition(
	partition: ReturnType<typeof useAiChatIdentityPartition>,
) {
	return (
		typeof partition === "string" &&
		(partition.startsWith("pending:") || partition.startsWith("error:"))
	);
}

function samePartition(
	left: ReturnType<typeof useAiChatIdentityPartition>,
	right: ReturnType<typeof useAiChatIdentityPartition>,
) {
	return (
		hashKey([aiChatIdentityKey(left)]) === hashKey([aiChatIdentityKey(right)])
	);
}

function queryBelongsToPartition(
	queryKey: readonly unknown[],
	partition: ReturnType<typeof useAiChatIdentityPartition>,
) {
	const marker = queryKey[3] as { identity?: unknown } | undefined;
	if (partition === undefined) return marker === undefined;
	return Boolean(
		marker &&
			hashKey([marker.identity]) === hashKey([aiChatIdentityKey(partition)]),
	);
}

function useCurrentHistoryRefresh() {
	const queryClient = useQueryClient();
	const { partition: identityPartition } = useAiChatIdentityState();
	const latestPartition = useRef(identityPartition);
	const mounted = useRef(true);
	useLayoutEffect(() => {
		latestPartition.current = identityPartition;
	}, [identityPartition]);
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const refreshAfterSuccess = async (startedAs: typeof identityPartition) => {
		const current = latestPartition.current;
		if (!mounted.current || !samePartition(startedAs, current)) {
			queryClient.removeQueries({
				queryKey: ["conversations"],
				predicate: ({ queryKey }) =>
					queryBelongsToPartition(queryKey, startedAs),
			});
			return;
		}
		await queryClient.invalidateQueries({
			queryKey: ["conversations"],
			predicate: ({ queryKey }) => queryBelongsToPartition(queryKey, current),
			refetchType: "all",
		});
	};

	return {
		currentPartition: () => identityPartition,
		refreshAfterSuccess,
	};
}

function withCurrentHistoryRefresh<TData, TVariables>(
	mutation: UseMutationResult<TData, Error, TVariables>,
	refresh: ReturnType<typeof useCurrentHistoryRefresh>,
): UseMutationResult<TData, Error, TVariables> {
	const mutateAsync: typeof mutation.mutateAsync = async (
		variables,
		options,
	) => {
		const startedAs = refresh.currentPartition();
		const result = await mutation.mutateAsync(variables, options);
		await refresh.refreshAfterSuccess(startedAs);
		return result;
	};
	const mutate: typeof mutation.mutate = (variables, options) => {
		void mutateAsync(variables, options).catch(() => {});
	};
	return { ...mutation, mutate, mutateAsync };
}

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
	const {
		partition: identityPartition,
		isPending: isIdentityPending,
		error: identityError,
		refetchIdentity,
	} = useAiChatIdentityState();
	const query = aiChat.conversations.list.use([identityPartition], {
		enabled:
			(options.enabled ?? true) &&
			!isUnresolvedIdentityPartition(identityPartition),
	});

	return {
		conversations: query.data ?? [],
		isLoading: isIdentityPending || query.isLoading,
		error: identityError ?? query.error,
		refetch: () => {
			if (isUnresolvedIdentityPartition(identityPartition)) {
				void refetchIdentity();
				return;
			}
			void query.refetch();
		},
	};
}

/** Suspense variant of useConversations. */
export function useSuspenseConversations(): {
	conversations: SerializedConversation[];
	refetch: () => Promise<unknown>;
} {
	const {
		partition: identityPartition,
		isPending: isIdentityPending,
		error: identityError,
		refetchIdentity,
	} = useAiChatIdentityState();
	const identityResolution = useIdentityResolutionPromise();
	const query = aiChat.conversations.list.useSuspense([identityPartition]);
	if (identityError) throw identityError;
	if (isIdentityPending) throw identityResolution ?? Promise.resolve();
	return {
		conversations: query.data ?? [],
		refetch: isUnresolvedIdentityPartition(identityPartition)
			? refetchIdentity
			: query.refetch,
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
	const {
		partition: identityPartition,
		isPending: isIdentityPending,
		error: identityError,
		refetchIdentity,
	} = useAiChatIdentityState();
	const query = aiChat.conversations.detail.use([id ?? "", identityPartition], {
		enabled:
			(options.enabled ?? true) &&
			!!id &&
			!isUnresolvedIdentityPartition(identityPartition),
	});

	return {
		conversation: query.data ?? null,
		isLoading: isIdentityPending || query.isLoading,
		error: identityError ?? query.error,
		refetch: () => {
			if (isUnresolvedIdentityPartition(identityPartition)) {
				void refetchIdentity();
				return;
			}
			void query.refetch();
		},
	};
}

/** Suspense variant of useConversation. */
export function useSuspenseConversation(id: string): {
	conversation: ConversationWithMessages | null;
	refetch: () => Promise<unknown>;
} {
	const {
		partition: identityPartition,
		isPending: isIdentityPending,
		error: identityError,
		refetchIdentity,
	} = useAiChatIdentityState();
	const identityResolution = useIdentityResolutionPromise();
	const query = aiChat.conversations.detail.useSuspense([
		id,
		identityPartition,
	]);
	if (identityError) throw identityError;
	if (isIdentityPending) throw identityResolution ?? Promise.resolve();
	return {
		conversation: query.data ?? null,
		refetch: isUnresolvedIdentityPartition(identityPartition)
			? refetchIdentity
			: query.refetch,
	};
}

/** Create a persisted conversation. */
export function useCreateConversation() {
	return withCurrentHistoryRefresh(
		aiChat.conversations.create.use(),
		useCurrentHistoryRefresh(),
	);
}

/** Rename a persisted conversation. */
export function useRenameConversation() {
	return withCurrentHistoryRefresh(
		aiChat.conversations.rename.use(),
		useCurrentHistoryRefresh(),
	);
}

/** Delete a persisted conversation. */
export function useDeleteConversation() {
	return withCurrentHistoryRefresh(
		aiChat.conversations.delete.use(),
		useCurrentHistoryRefresh(),
	);
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
	const historyRefresh = useCurrentHistoryRefresh();

	const form = aiChat.conversations.useForm<
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
		errorMessage: () =>
			localization?.CONVERSATION_RENAME_FAILURE ??
			t("aiChat.toasts.renameFailure", "Failed to rename conversation"),
		onSuccess: options.onSuccess,
	});
	const submit: typeof form.submit = async (values) => {
		const startedAs = historyRefresh.currentPartition();
		const result = await form.submit(values);
		await historyRefresh.refreshAfterSuccess(startedAs);
		return result;
	};
	return { ...form, submit };
}

export type {
	ConversationWithMessages,
	CreateConversationInput,
	RenameConversationInput,
	SerializedConversation,
	SerializedMessage,
};
