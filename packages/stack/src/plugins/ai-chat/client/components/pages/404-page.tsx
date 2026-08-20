"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { ErrorPlaceholder } from "../shared/error-placeholder";
import { useAiChatTranslation } from "../../localization";
import type { AiChatPluginOverrides } from "../../overrides";

export function NotFoundPage({ message }: { message?: string }) {
	const { localization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {
		localization: {},
	});
	const tr = useAiChatTranslation(localization);
	const title = tr(
		"CHAT_PAGE_NOT_FOUND_TITLE",
		"aiChat.errors.notFoundTitle",
		"Chat not found",
	);
	const desc =
		message ||
		tr(
			"CHAT_PAGE_NOT_FOUND_DESCRIPTION",
			"aiChat.errors.notFoundDescription",
			"The conversation you're looking for doesn't exist or has been deleted.",
		);
	return (
		<div data-testid="404-page" className="flex flex-col h-[calc(100vh-4rem)]">
			<ErrorPlaceholder title={title} message={desc} />
		</div>
	);
}
