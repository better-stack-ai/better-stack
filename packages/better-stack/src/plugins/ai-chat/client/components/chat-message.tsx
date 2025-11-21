"use client";

import { cn } from "@workspace/ui/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Bot } from "lucide-react";
import type { UIMessage } from "ai";

export function ChatMessage({ message }: { message: UIMessage }) {
	const isUser = message.role === "user";

	// Render message parts according to AI SDK UI format
	// See: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
	return (
		<div
			className={cn(
				"flex gap-3 mb-4 w-full",
				isUser ? "justify-end" : "justify-start",
			)}
		>
			{!isUser && (
				<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
					<Bot className="w-5 h-5" />
				</div>
			)}
			<div
				className={cn(
					"max-w-[80%] rounded-lg px-4 py-2",
					isUser ? "bg-primary text-primary-foreground" : "bg-muted",
				)}
			>
				<div className="prose dark:prose-invert max-w-none text-sm break-words">
					{message.parts && Array.isArray(message.parts) ? (
						message.parts.map((part, index) => {
							if (part.type === "text") {
								return (
									<ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
										{part.text}
									</ReactMarkdown>
								);
							}
							return null;
						})
					) : (
						<span>No content</span>
					)}
				</div>
			</div>
			{isUser && (
				<div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 text-primary-foreground">
					<User className="w-5 h-5" />
				</div>
			)}
		</div>
	);
}
