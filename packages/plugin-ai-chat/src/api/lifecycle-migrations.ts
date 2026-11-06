/**
 * Removed AI Chat lifecycle names and their canonical v3 replacements.
 *
 * This structured inventory is the source for migration documentation and
 * repository guards. Names absent from this map did not change.
 */
export const AI_CHAT_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeToolsActivated: "onBeforeActivateTools",
	onConversationsRead: "onAfterListConversations",
	onConversationRead: "onAfterGetConversation",
	onConversationCreated: "onAfterCreateConversation",
	onConversationUpdated: "onAfterUpdateConversation",
	onConversationDeleted: "onAfterDeleteConversation",
	onChatError: "onErrorChat",
	onListConversationsError: "onErrorListConversations",
	onGetConversationError: "onErrorGetConversation",
	onCreateConversationError: "onErrorCreateConversation",
	onUpdateConversationError: "onErrorUpdateConversation",
	onDeleteConversationError: "onErrorDeleteConversation",
} as const);
