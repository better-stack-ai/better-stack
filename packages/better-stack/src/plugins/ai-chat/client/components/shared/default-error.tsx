"use client";

import type { FallbackProps } from "react-error-boundary";
import { ErrorPlaceholder } from "./error-placeholder";
import { usePluginOverrides } from "@btst/stack/context";
import { AI_CHAT_LOCALIZATION } from "../../localization";
import type { AiChatPluginOverrides } from "../../overrides";

// Default error component for AI chat plugin routes
export function DefaultError({ error }: FallbackProps) {
	const { localization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {
		localization: AI_CHAT_LOCALIZATION,
	});
	const title =
		localization?.CHAT_GENERIC_ERROR_TITLE ??
		AI_CHAT_LOCALIZATION.CHAT_GENERIC_ERROR_TITLE;
	const message =
		process.env.NODE_ENV === "production"
			? (localization?.CHAT_GENERIC_ERROR_MESSAGE ??
				AI_CHAT_LOCALIZATION.CHAT_GENERIC_ERROR_MESSAGE)
			: (error?.message ??
				localization?.CHAT_GENERIC_ERROR_MESSAGE ??
				AI_CHAT_LOCALIZATION.CHAT_GENERIC_ERROR_MESSAGE);
	return <ErrorPlaceholder title={title} message={message} />;
}
