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

	// Sidebar
	SIDEBAR_TITLE: string;
	SIDEBAR_NEW_CHAT: string;
	SIDEBAR_NO_CONVERSATIONS: string;
	SIDEBAR_SEARCH_PLACEHOLDER: string;

	// Conversation actions
	CONVERSATION_RENAME: string;
	CONVERSATION_RENAME_PLACEHOLDER: string;
	CONVERSATION_RENAME_SAVE: string;
	CONVERSATION_RENAME_CANCEL: string;
	CONVERSATION_DELETE: string;
	CONVERSATION_DELETE_CONFIRM_TITLE: string;
	CONVERSATION_DELETE_CONFIRM_DESCRIPTION: string;
	CONVERSATION_DELETE_CONFIRM_BUTTON: string;
	CONVERSATION_DELETE_CANCEL: string;

	// Image upload
	IMAGE_UPLOAD_BUTTON: string;
	IMAGE_UPLOAD_UPLOADING: string;
	IMAGE_UPLOAD_ERROR_NOT_IMAGE: string;
	IMAGE_UPLOAD_ERROR_TOO_LARGE: string;
	IMAGE_UPLOAD_SUCCESS: string;
	IMAGE_UPLOAD_FAILURE: string;

	// Timestamps
	TIME_JUST_NOW: string;
	TIME_MINUTES_AGO: string;
	TIME_HOURS_AGO: string;
	TIME_YESTERDAY: string;
	TIME_DAYS_AGO: string;

	// Accessibility
	A11Y_USER_MESSAGE: string;
	A11Y_ASSISTANT_MESSAGE: string;
	A11Y_COPY_CODE: string;
	A11Y_CODE_COPIED: string;
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

	// Sidebar
	SIDEBAR_TITLE: "Conversations",
	SIDEBAR_NEW_CHAT: "New chat",
	SIDEBAR_NO_CONVERSATIONS: "No conversations yet",
	SIDEBAR_SEARCH_PLACEHOLDER: "Search conversations...",

	// Conversation actions
	CONVERSATION_RENAME: "Rename",
	CONVERSATION_RENAME_PLACEHOLDER: "Enter conversation name",
	CONVERSATION_RENAME_SAVE: "Save",
	CONVERSATION_RENAME_CANCEL: "Cancel",
	CONVERSATION_DELETE: "Delete",
	CONVERSATION_DELETE_CONFIRM_TITLE: "Delete conversation",
	CONVERSATION_DELETE_CONFIRM_DESCRIPTION:
		"Are you sure you want to delete this conversation? This action cannot be undone.",
	CONVERSATION_DELETE_CONFIRM_BUTTON: "Delete",
	CONVERSATION_DELETE_CANCEL: "Cancel",

	// Image upload
	IMAGE_UPLOAD_BUTTON: "Attach image",
	IMAGE_UPLOAD_UPLOADING: "Uploading...",
	IMAGE_UPLOAD_ERROR_NOT_IMAGE: "Please select an image file",
	IMAGE_UPLOAD_ERROR_TOO_LARGE: "Image must be less than 4MB",
	IMAGE_UPLOAD_SUCCESS: "Image uploaded",
	IMAGE_UPLOAD_FAILURE: "Failed to upload image",

	// Timestamps
	TIME_JUST_NOW: "Just now",
	TIME_MINUTES_AGO: "{count} minutes ago",
	TIME_HOURS_AGO: "{count} hours ago",
	TIME_YESTERDAY: "Yesterday",
	TIME_DAYS_AGO: "{count} days ago",

	// Accessibility
	A11Y_USER_MESSAGE: "Your message",
	A11Y_ASSISTANT_MESSAGE: "AI response",
	A11Y_COPY_CODE: "Copy code",
	A11Y_CODE_COPIED: "Code copied",
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
