"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../../overrides";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { ChatLoading } from "../loading";
import { NotFoundPage } from "./404-page";
import { aiChatPermissions } from "../../../permissions";
import { useConversation } from "../../hooks/chat-hooks";

// Lazy load the internal component with actual page content
const ChatPage = lazy(() =>
	import("./chat-page.internal").then((m) => ({ default: m.ChatPage })),
);

export interface ChatPageComponentProps {
	conversationId?: string;
	/** Resolved plugin mode for route-owned rendering. */
	mode?: "authenticated" | "public";
}

// Exported wrapped component with error and loading boundaries
export function ChatPageComponent({
	conversationId,
	mode: configuredMode,
}: ChatPageComponentProps) {
	const { mode: overrideMode, onRouteError } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("aiChat", {});
	const mode = configuredMode ?? overrideMode;
	return (
		<ComposedRoute
			path={conversationId ? `/chat/${conversationId}` : "/chat"}
			PageComponent={AuthorizedChatPage}
			ErrorComponent={DefaultError}
			LoadingComponent={ChatLoading}
			NotFoundComponent={NotFoundPage}
			props={{ conversationId, mode }}
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

function AuthorizedChatPage({ conversationId, mode }: ChatPageComponentProps) {
	if (mode === "public") {
		return <ChatPage conversationId={conversationId} mode={mode} />;
	}
	if (!conversationId) {
		return (
			<PermissionRouteAccess
				permission={aiChatPermissions.conversation.read({
					scope: "collection",
				})}
				LoadingComponent={ChatLoading}
			>
				<ChatPage mode={mode} />
			</PermissionRouteAccess>
		);
	}
	return (
		<AuthorizedConversationPage conversationId={conversationId} mode={mode} />
	);
}

function AuthorizedConversationPage({
	conversationId,
	mode,
}: {
	conversationId: string;
	mode?: "authenticated" | "public";
}) {
	const { conversation, error, isLoading } = useConversation(conversationId);
	if (error) throw error;
	if (isLoading) return <ChatLoading />;
	if (!conversation) return <NotFoundPage />;
	return (
		<PermissionRouteAccess
			permission={aiChatPermissions.conversation.read({
				scope: "record",
				conversationId: conversation.id,
				exists: true,
				...(conversation.userId ? { ownerId: conversation.userId } : {}),
			})}
			LoadingComponent={ChatLoading}
		>
			<ChatPage conversationId={conversationId} mode={mode} />
		</PermissionRouteAccess>
	);
}
