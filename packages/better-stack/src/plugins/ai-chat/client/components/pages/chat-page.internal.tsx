"use client";

import { ChatLayout } from "../chat-layout";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../../overrides";

export interface ChatPageProps {
	conversationId?: string;
}

/**
 * Internal chat page component - loaded lazily by ChatPageComponent
 */
export function ChatPage({ conversationId }: ChatPageProps) {
	const { apiBaseURL, apiBasePath, mode } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});

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
