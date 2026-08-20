"use client";

import { useMemo } from "react";
import { ChatLayout } from "../chat-layout";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

export interface ChatPageProps {
	conversationId?: string;
}

/**
 * Internal chat page component - loaded lazily by ChatPageComponent
 */
export function ChatPage({ conversationId }: ChatPageProps) {
	const overrides = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});
	const { apiBaseURL, apiBasePath, mode } = overrides;
	const routeName = conversationId ? "chatConversation" : "chat";
	const context = useMemo(
		() => ({
			path: conversationId ? `/chat/${conversationId}` : "/chat",
			params: conversationId ? { id: conversationId } : undefined,
			isSSR: typeof window === "undefined",
		}),
		[conversationId],
	);

	useRouteLifecycle({
		routeName,
		context,
		overrides,
		beforeRenderHook: (currentOverrides, routeContext) => {
			if (conversationId && currentOverrides.onBeforeConversationPageRendered) {
				return currentOverrides.onBeforeConversationPageRendered(
					conversationId,
					routeContext,
				);
			}
			if (!conversationId && currentOverrides.onBeforeChatPageRendered) {
				return currentOverrides.onBeforeChatPageRendered(routeContext);
			}
			return true;
		},
	});

	// In public mode, don't show sidebar
	const showSidebar = mode !== "public";

	return (
		<ChatLayout
			apiBaseURL={apiBaseURL ?? ""}
			apiBasePath={apiBasePath ?? ""}
			conversationId={conversationId}
			showSidebar={showSidebar}
		/>
	);
}
