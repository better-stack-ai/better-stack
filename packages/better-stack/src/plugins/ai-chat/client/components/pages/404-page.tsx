"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { ErrorPlaceholder } from "../shared/error-placeholder";
import { AI_CHAT_LOCALIZATION } from "../../localization";
import type { AiChatPluginOverrides } from "../../overrides";

export function NotFoundPage({ message }: { message?: string }) {
	const { localization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {
		localization: AI_CHAT_LOCALIZATION,
	});
	const title =
		localization?.CHAT_PAGE_NOT_FOUND_TITLE ??
		AI_CHAT_LOCALIZATION.CHAT_PAGE_NOT_FOUND_TITLE;
	const desc =
		message ||
		(localization?.CHAT_PAGE_NOT_FOUND_DESCRIPTION ??
			AI_CHAT_LOCALIZATION.CHAT_PAGE_NOT_FOUND_DESCRIPTION);
	return (
		<div data-testid="404-page" className="flex flex-col h-[calc(100vh-4rem)]">
			<ErrorPlaceholder title={title} message={desc} />
		</div>
	);
}
