"use client";

import { useMemo } from "react";
import { ChatLayout } from "../chat-layout";
import { usePluginOverrides, useStack } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../../overrides";
import { resolveAiChatMode } from "../../overrides";
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
	>("aiChat", {});
	const { plugins } = useStack();
	const mode = resolveAiChatMode(plugins?.aiChat?.config);
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
	});

	// In public mode, don't show sidebar
	const showSidebar = mode !== "public";

	return (
		<ChatLayout conversationId={conversationId} showSidebar={showSidebar} />
	);
}
