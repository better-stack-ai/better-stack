"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { ChatLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const ChatPage = lazy(() =>
	import("./chat-page.internal").then((m) => ({ default: m.ChatPage })),
);

export interface ChatPageComponentProps {
	conversationId?: string;
}

// Exported wrapped component with error and loading boundaries
export function ChatPageComponent({ conversationId }: ChatPageComponentProps) {
	const { onRouteError } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});

	return (
		<ComposedRoute
			path={conversationId ? `/chat/${conversationId}` : "/chat"}
			PageComponent={ChatPage}
			ErrorComponent={DefaultError}
			LoadingComponent={ChatLoading}
			NotFoundComponent={NotFoundPage}
			props={{ conversationId }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError(conversationId ? "chatConversation" : "chat", error, {
						path: conversationId ? `/chat/${conversationId}` : "/chat",
						isSSR: typeof window === "undefined",
						params: conversationId ? { id: conversationId } : undefined,
					});
				}
			}}
		/>
	);
}
