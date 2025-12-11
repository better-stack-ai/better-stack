"use client";

import { cn } from "@workspace/ui/lib/utils";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";
import { User, Bot } from "lucide-react";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";

// Import remend for streaming markdown
import completeMarkdown from "remend";

interface ChatMessageProps {
	message: UIMessage;
	isStreaming?: boolean;
	variant?: "default" | "compact";
}

export function ChatMessage({
	message,
	isStreaming = false,
	variant = "default",
}: ChatMessageProps) {
	const isUser = message.role === "user";

	const {
		Link,
		Image,
		localization: customLocalization,
	} = usePluginOverrides<AiChatPluginOverrides, Partial<AiChatPluginOverrides>>(
		"ai-chat",
		{},
	);

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };

	// Extract text content from message parts
	const textContent = useMemo(() => {
		if (message.parts && Array.isArray(message.parts)) {
			return message.parts
				.filter((part: any) => part.type === "text")
				.map((part: any) => part.text)
				.join("");
		}
		return "";
	}, [message.parts]);

	// Use remend to complete partial markdown when streaming
	const displayContent = useMemo(() => {
		if (!textContent) return "";
		if (isStreaming && !isUser) {
			// Complete any unclosed markdown elements during streaming
			return completeMarkdown(textContent);
		}
		return textContent;
	}, [textContent, isStreaming, isUser]);

	const isCompact = variant === "compact";

	return (
		<div
			className={cn(
				"flex gap-3 w-full",
				isCompact ? "mb-3" : "mb-4",
				isUser ? "justify-end" : "justify-start",
			)}
			aria-label={
				isUser
					? localization.A11Y_USER_MESSAGE
					: localization.A11Y_ASSISTANT_MESSAGE
			}
		>
			{/* Assistant Avatar */}
			{!isUser && (
				<div
					className={cn(
						"rounded-full bg-muted flex items-center justify-center shrink-0",
						isCompact ? "w-7 h-7" : "w-8 h-8",
					)}
				>
					<Bot className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
				</div>
			)}

			{/* Message Content */}
			<div
				className={cn(
					"rounded-lg",
					isCompact ? "px-3 py-2 max-w-[85%]" : "px-4 py-3 max-w-[80%]",
					isUser ? "bg-primary text-primary-foreground" : "bg-muted",
				)}
			>
				{isUser ? (
					// User messages: simple text
					<p
						className={cn(
							"whitespace-pre-wrap break-words",
							isCompact ? "text-sm" : "text-sm",
						)}
					>
						{textContent}
					</p>
				) : (
					// Assistant messages: rendered markdown
					<div
						className={cn(
							"prose dark:prose-invert max-w-none break-words",
							isCompact ? "prose-sm" : "prose-sm",
							// Override prose styles for better chat appearance
							"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
						)}
					>
						{displayContent ? (
							<MarkdownContent
								markdown={displayContent}
								variant="chat"
								LinkComponent={Link}
								ImageComponent={Image}
							/>
						) : (
							<span className="text-muted-foreground">...</span>
						)}
					</div>
				)}
			</div>

			{/* User Avatar */}
			{isUser && (
				<div
					className={cn(
						"rounded-full bg-primary flex items-center justify-center shrink-0 text-primary-foreground",
						isCompact ? "w-7 h-7" : "w-8 h-8",
					)}
				>
					<User className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
				</div>
			)}
		</div>
	);
}
