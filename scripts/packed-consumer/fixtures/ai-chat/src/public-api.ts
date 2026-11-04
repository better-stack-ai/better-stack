import {
	aiChatBackendPlugin,
	type AiChatBackendConfig,
} from "@btst/plugin-ai-chat/api";
import {
	aiChatClientPlugin,
	type ChatLayoutProps,
} from "@btst/plugin-ai-chat/client";
import { useConversation } from "@btst/plugin-ai-chat/client/hooks";
import { createAiChatQueryKeys } from "@btst/plugin-ai-chat/query-keys";
import { aiChatPermissions } from "@btst/plugin-ai-chat/permissions";
import type { SerializedConversation } from "@btst/plugin-ai-chat/types";

export type PackedAiChatApi = {
	backend: typeof aiChatBackendPlugin;
	backendConfig: AiChatBackendConfig;
	client: typeof aiChatClientPlugin;
	layout: ChatLayoutProps;
	hook: typeof useConversation;
	queryKeys: typeof createAiChatQueryKeys;
	permissions: typeof aiChatPermissions;
	conversation: SerializedConversation;
};
