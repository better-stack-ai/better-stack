"use client";

import { useCallback } from "react";
import { useTranslate, type TranslateFn } from "@btst/stack/context";

/**
 * AI Chat plugin localization strings
 */
export interface AiChatLocalization {
	// Chat interface
	CHAT_PLACEHOLDER: string;
	CHAT_SEND_BUTTON: string;
	CHAT_EMPTY_STATE: string;
	CHAT_LOADING: string;
	CHAT_ERROR: string;
	CHAT_RETRY: string;

	// Page errors
	CHAT_GENERIC_ERROR_TITLE: string;
	CHAT_GENERIC_ERROR_MESSAGE: string;
	CHAT_PAGE_NOT_FOUND_TITLE: string;
	CHAT_PAGE_NOT_FOUND_DESCRIPTION: string;

	// Sidebar
	SIDEBAR_TITLE: string;
	SIDEBAR_NEW_CHAT: string;
	SIDEBAR_NO_CONVERSATIONS: string;
	SIDEBAR_SEARCH_PLACEHOLDER: string;

	// Conversation actions
	CONVERSATION_RENAME: string;
	CONVERSATION_RENAME_PLACEHOLDER: string;
	CONVERSATION_RENAME_DESCRIPTION: string;
	CONVERSATION_RENAME_SAVE: string;
	CONVERSATION_RENAME_CANCEL: string;
	CONVERSATION_DELETE: string;
	CONVERSATION_DELETE_CONFIRM_TITLE: string;
	CONVERSATION_DELETE_CONFIRM_DESCRIPTION: string;
	CONVERSATION_DELETE_CONFIRM_BUTTON: string;
	CONVERSATION_DELETE_CANCEL: string;
	CONVERSATION_RENAME_SUCCESS: string;
	CONVERSATION_RENAME_FAILURE: string;
	CONVERSATION_DELETE_SUCCESS: string;
	CONVERSATION_DELETE_FAILURE: string;
	CONVERSATION_TITLE_REQUIRED: string;

	// Image upload (legacy)
	IMAGE_UPLOAD_BUTTON: string;
	IMAGE_UPLOAD_UPLOADING: string;
	IMAGE_UPLOAD_ERROR_NOT_IMAGE: string;
	IMAGE_UPLOAD_ERROR_TOO_LARGE: string;
	IMAGE_UPLOAD_SUCCESS: string;
	IMAGE_UPLOAD_FAILURE: string;

	// File upload
	FILE_UPLOAD_BUTTON: string;
	FILE_UPLOAD_ERROR_TOO_LARGE: string;
	FILE_UPLOAD_SUCCESS: string;
	FILE_UPLOAD_FAILURE: string;
	FILE_REMOVE: string;
	FILE_FALLBACK_NAME: string;
	IMAGE_ATTACHED_ALT: string;
	IMAGE_GENERATED_ALT: string;

	// Timestamps
	TIME_JUST_NOW: string;
	TIME_MINUTES_AGO: string;
	TIME_HOURS_AGO: string;
	TIME_YESTERDAY: string;
	TIME_DAYS_AGO: string;

	// Message actions
	MESSAGE_COPY: string;
	MESSAGE_COPIED: string;
	MESSAGE_RETRY: string;
	MESSAGE_EDIT: string;
	MESSAGE_SAVE: string;
	MESSAGE_CANCEL: string;

	// Accessibility
	A11Y_USER_MESSAGE: string;
	A11Y_ASSISTANT_MESSAGE: string;
	A11Y_COPY_CODE: string;
	A11Y_CODE_COPIED: string;
	A11Y_CONVERSATION_ACTIONS: string;
	A11Y_CHAT_TITLE: string;
	A11Y_CLEAR_CHAT: string;
	A11Y_CLOSE_CHAT: string;
	A11Y_OPEN_CHAT: string;
	A11Y_OPEN_MENU: string;
	A11Y_CLOSE_SIDEBAR: string;
	A11Y_OPEN_SIDEBAR: string;

	// Tool calls
	TOOL_STATUS_RUNNING: string;
	TOOL_STATUS_EXECUTING: string;
	TOOL_STATUS_ERROR: string;
	TOOL_STATUS_COMPLETE: string;
	TOOL_STATUS_PENDING: string;
	TOOL_INPUT: string;
	TOOL_OUTPUT: string;
	TOOL_ID: string;
	TOOL_EXECUTION_FAILED: string;
	TOOL_HANDLER_MISSING: string;
}

/**
 * Default English localization strings
 */
export const AI_CHAT_LOCALIZATION: AiChatLocalization = {
	// Chat interface
	CHAT_PLACEHOLDER: "Type a message...",
	CHAT_SEND_BUTTON: "Send",
	CHAT_EMPTY_STATE: "Start a conversation...",
	CHAT_LOADING: "Thinking...",
	CHAT_ERROR: "Something went wrong. Please try again.",
	CHAT_RETRY: "Retry",

	// Page errors
	CHAT_GENERIC_ERROR_TITLE: "Something went wrong",
	CHAT_GENERIC_ERROR_MESSAGE:
		"An error occurred while loading the chat. Please try again.",
	CHAT_PAGE_NOT_FOUND_TITLE: "Chat not found",
	CHAT_PAGE_NOT_FOUND_DESCRIPTION:
		"The conversation you're looking for doesn't exist or has been deleted.",

	// Sidebar
	SIDEBAR_TITLE: "Conversations",
	SIDEBAR_NEW_CHAT: "New chat",
	SIDEBAR_NO_CONVERSATIONS: "No conversations yet",
	SIDEBAR_SEARCH_PLACEHOLDER: "Search conversations...",

	// Conversation actions
	CONVERSATION_RENAME: "Rename",
	CONVERSATION_RENAME_PLACEHOLDER: "Enter conversation name",
	CONVERSATION_RENAME_DESCRIPTION: "Enter a new title for this conversation.",
	CONVERSATION_RENAME_SAVE: "Save",
	CONVERSATION_RENAME_CANCEL: "Cancel",
	CONVERSATION_DELETE: "Delete",
	CONVERSATION_DELETE_CONFIRM_TITLE: "Delete conversation",
	CONVERSATION_DELETE_CONFIRM_DESCRIPTION:
		"Are you sure you want to delete this conversation? This action cannot be undone.",
	CONVERSATION_DELETE_CONFIRM_BUTTON: "Delete",
	CONVERSATION_DELETE_CANCEL: "Cancel",
	CONVERSATION_RENAME_SUCCESS: "Conversation renamed",
	CONVERSATION_RENAME_FAILURE: "Failed to rename conversation",
	CONVERSATION_DELETE_SUCCESS: "Conversation deleted",
	CONVERSATION_DELETE_FAILURE: "Failed to delete conversation",
	CONVERSATION_TITLE_REQUIRED: "Title is required",

	// Image upload (legacy)
	IMAGE_UPLOAD_BUTTON: "Attach image",
	IMAGE_UPLOAD_UPLOADING: "Uploading...",
	IMAGE_UPLOAD_ERROR_NOT_IMAGE: "Please select an image file",
	IMAGE_UPLOAD_ERROR_TOO_LARGE: "Image must be less than 4MB",
	IMAGE_UPLOAD_SUCCESS: "Image uploaded",
	IMAGE_UPLOAD_FAILURE: "Failed to upload image",

	// File upload
	FILE_UPLOAD_BUTTON: "Attach file",
	FILE_UPLOAD_ERROR_TOO_LARGE: "File must be less than 10MB",
	FILE_UPLOAD_SUCCESS: "File attached",
	FILE_UPLOAD_FAILURE: "Failed to attach file",
	FILE_REMOVE: "Remove file",
	FILE_FALLBACK_NAME: "File",
	IMAGE_ATTACHED_ALT: "Attached image {count}",
	IMAGE_GENERATED_ALT: "Image {count}",

	// Timestamps
	TIME_JUST_NOW: "Just now",
	TIME_MINUTES_AGO: "{count} minutes ago",
	TIME_HOURS_AGO: "{count} hours ago",
	TIME_YESTERDAY: "Yesterday",
	TIME_DAYS_AGO: "{count} days ago",

	// Message actions
	MESSAGE_COPY: "Copy message",
	MESSAGE_COPIED: "Copied!",
	MESSAGE_RETRY: "Retry",
	MESSAGE_EDIT: "Edit message",
	MESSAGE_SAVE: "Save",
	MESSAGE_CANCEL: "Cancel",

	// Accessibility
	A11Y_USER_MESSAGE: "Your message",
	A11Y_ASSISTANT_MESSAGE: "AI response",
	A11Y_COPY_CODE: "Copy code",
	A11Y_CODE_COPIED: "Code copied",
	A11Y_CONVERSATION_ACTIONS: "Conversation actions",
	A11Y_CHAT_TITLE: "AI Chat",
	A11Y_CLEAR_CHAT: "Clear chat",
	A11Y_CLOSE_CHAT: "Close chat",
	A11Y_OPEN_CHAT: "Open chat",
	A11Y_OPEN_MENU: "Open menu",
	A11Y_CLOSE_SIDEBAR: "Close sidebar",
	A11Y_OPEN_SIDEBAR: "Open sidebar",

	// Tool calls
	TOOL_STATUS_RUNNING: "Running...",
	TOOL_STATUS_EXECUTING: "Executing...",
	TOOL_STATUS_ERROR: "Error",
	TOOL_STATUS_COMPLETE: "Complete",
	TOOL_STATUS_PENDING: "Pending",
	TOOL_INPUT: "Input",
	TOOL_OUTPUT: "Output",
	TOOL_ID: "ID: {id}",
	TOOL_EXECUTION_FAILED: "Tool execution failed",
	TOOL_HANDLER_MISSING:
		'No client-side handler registered for tool "{toolName}". The page context may have changed while the response was streaming.',
};

/**
 * Helper function to format localized strings with placeholders
 */
export function formatLocalized(
	template: string,
	values: Record<string, string | number>,
): string {
	return template.replace(/\{(\w+)\}/g, (match, key) => {
		return values[key]?.toString() ?? match;
	});
}

/**
 * Resolves AI Chat strings with the legacy override taking precedence over
 * the StackProvider i18n catalog. Legacy `{name}` placeholders remain
 * supported while catalog defaults use `{{name}}` interpolation.
 */
export function resolveAiChatString(
	t: TranslateFn,
	localization: Partial<AiChatLocalization> | undefined,
	legacyKey: keyof AiChatLocalization,
	key: string,
	defaultValue: string,
	params?: Record<string, string | number>,
): string {
	const legacyValue = localization?.[legacyKey];
	if (legacyValue !== undefined) {
		return params ? formatLocalized(legacyValue, params) : legacyValue;
	}
	return t(key, defaultValue, params);
}

/** Client hook for resolving AI Chat catalog strings. */
export function useAiChatTranslation(
	localization?: Partial<AiChatLocalization>,
) {
	const t = useTranslate();
	return useCallback(
		(
			legacyKey: keyof AiChatLocalization,
			key: string,
			defaultValue: string,
			params?: Record<string, string | number>,
		) =>
			resolveAiChatString(
				t,
				localization,
				legacyKey,
				key,
				defaultValue,
				params,
			),
		[t, localization],
	);
}
