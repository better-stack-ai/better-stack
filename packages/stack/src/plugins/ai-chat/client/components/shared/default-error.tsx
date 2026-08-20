"use client";

import type { FallbackProps } from "react-error-boundary";
import { ErrorPlaceholder } from "./error-placeholder";
import { usePluginOverrides } from "@btst/stack/context";
import { useAiChatTranslation } from "../../localization";
import type { AiChatPluginOverrides } from "../../overrides";

// Default error component for AI chat plugin routes
export function DefaultError({ error }: FallbackProps) {
	const { localization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {
		localization: {},
	});
	const tr = useAiChatTranslation(localization);
	const title = tr(
		"CHAT_GENERIC_ERROR_TITLE",
		"aiChat.errors.genericTitle",
		"Something went wrong",
	);
	const message =
		process.env.NODE_ENV === "production"
			? tr(
					"CHAT_GENERIC_ERROR_MESSAGE",
					"aiChat.errors.genericMessage",
					"An error occurred while loading the chat. Please try again.",
				)
			: ((error instanceof Error ? error.message : undefined) ??
				tr(
					"CHAT_GENERIC_ERROR_MESSAGE",
					"aiChat.errors.genericMessage",
					"An error occurred while loading the chat. Please try again.",
				));
	return <ErrorPlaceholder title={title} message={message} />;
}
