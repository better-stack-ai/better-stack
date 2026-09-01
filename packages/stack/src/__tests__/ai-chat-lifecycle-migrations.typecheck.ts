import type { AiChatBackendHooks } from "../plugins/ai-chat/api";

const canonicalHooks = {
	onBeforeChat: async () => undefined,
	onAfterChat: async () => undefined,
	onBeforeActivateTools: async () => [],
	onBeforeListConversations: async () => undefined,
	onAfterListConversations: async () => undefined,
	onErrorListConversations: async () => undefined,
	onBeforeGetConversation: async () => undefined,
	onAfterGetConversation: async () => undefined,
	onErrorGetConversation: async () => undefined,
	onBeforeCreateConversation: async () => undefined,
	onAfterCreateConversation: async () => undefined,
	onErrorCreateConversation: async () => undefined,
	onBeforeUpdateConversation: async () => undefined,
	onAfterUpdateConversation: async () => undefined,
	onErrorUpdateConversation: async () => undefined,
	onBeforeDeleteConversation: async () => undefined,
	onAfterDeleteConversation: async () => undefined,
	onErrorDeleteConversation: async () => undefined,
	onErrorChat: async () => undefined,
} satisfies AiChatBackendHooks;

void canonicalHooks;

// Explicit migration fixtures: every removed spelling must stay rejected.
// @ts-expect-error Use onBeforeActivateTools.
({ onBeforeToolsActivated: async () => [] }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onAfterListConversations.
({ onConversationsRead: async () => undefined }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onAfterGetConversation.
({ onConversationRead: async () => undefined }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onAfterCreateConversation.
({ onConversationCreated: async () => undefined }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onAfterUpdateConversation.
({ onConversationUpdated: async () => undefined }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onAfterDeleteConversation.
({ onConversationDeleted: async () => undefined }) satisfies AiChatBackendHooks;
// @ts-expect-error Use onErrorChat.
({ onChatError: async () => undefined }) satisfies AiChatBackendHooks;
({
	// @ts-expect-error Use onErrorListConversations.
	onListConversationsError: async () => undefined,
}) satisfies AiChatBackendHooks;
({
	// @ts-expect-error Use onErrorGetConversation.
	onGetConversationError: async () => undefined,
}) satisfies AiChatBackendHooks;
({
	// @ts-expect-error Use onErrorCreateConversation.
	onCreateConversationError: async () => undefined,
}) satisfies AiChatBackendHooks;
({
	// @ts-expect-error Use onErrorUpdateConversation.
	onUpdateConversationError: async () => undefined,
}) satisfies AiChatBackendHooks;
({
	// @ts-expect-error Use onErrorDeleteConversation.
	onDeleteConversationError: async () => undefined,
}) satisfies AiChatBackendHooks;
