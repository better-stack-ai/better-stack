import api = require("@btst/plugin-ai-chat/api");
import permissions = require("@btst/plugin-ai-chat/permissions");
import queries = require("@btst/plugin-ai-chat/query-keys");
import client = require("@btst/plugin-ai-chat/client");

export const backend: typeof api.aiChatBackendPlugin = api.aiChatBackendPlugin;
export const catalog: typeof permissions.aiChatPermissions =
	permissions.aiChatPermissions;
export const queryKeys: typeof queries.createAiChatQueryKeys =
	queries.createAiChatQueryKeys;
export type ClientFactory = typeof client.aiChatClientPlugin;
export type Layout = client.ChatLayoutProps;
