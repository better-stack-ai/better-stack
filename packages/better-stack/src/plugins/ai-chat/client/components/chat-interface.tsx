"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cn } from "@workspace/ui/lib/utils";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";

interface ChatInterfaceProps {
	apiPath?: string;
	initialMessages?: UIMessage[];
	id?: string;
	/** Variant: 'full' for full-page layout, 'widget' for embedded widget */
	variant?: "full" | "widget";
	className?: string;
}

export function ChatInterface({
	apiPath = "/api/chat",
	initialMessages,
	id,
	variant = "full",
	className,
}: ChatInterfaceProps) {
	const { localization: customLocalization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };

	const { messages, sendMessage, status, error, setMessages } = useChat({
		transport: new DefaultChatTransport({
			api: apiPath,
			body: { conversationId: id },
		}),
		onError: (err) => {
			console.error("useChat onError:", err);
		},
	});

	// Set initial messages on mount
	useEffect(() => {
		if (
			initialMessages &&
			initialMessages.length > 0 &&
			messages.length === 0
		) {
			setMessages(initialMessages);
		}
	}, [initialMessages, setMessages]);

	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when messages change
	useEffect(() => {
		if (scrollRef.current) {
			const scrollElement = scrollRef.current.querySelector(
				"[data-radix-scroll-area-viewport]",
			);
			if (scrollElement) {
				scrollElement.scrollTop = scrollElement.scrollHeight;
			}
		}
	}, [messages]);

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const text = input.trim();
		if (!text) return;

		setInput("");
		try {
			await sendMessage({ text });
		} catch (error) {
			console.error("Error sending message:", error);
		}
	};

	const isLoading = status === "streaming" || status === "submitted";

	const isWidget = variant === "widget";

	return (
		<div
			className={cn(
				"flex flex-col h-full w-full bg-background",
				isWidget && "rounded-xl",
				className,
			)}
			data-testid="chat-interface"
		>
			{/* Messages Area */}
			<ScrollArea ref={scrollRef} className="flex-1">
				<div
					className={cn(
						"flex flex-col p-4",
						isWidget ? "max-w-full" : "max-w-3xl mx-auto w-full",
					)}
				>
					{messages.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
							<p>{localization.CHAT_EMPTY_STATE}</p>
						</div>
					) : (
						messages.map((m) => (
							<ChatMessage
								key={m.id || `msg-${Math.random()}`}
								message={m}
								isStreaming={
									status === "streaming" &&
									m.id === messages[messages.length - 1]?.id &&
									m.role === "assistant"
								}
								variant={isWidget ? "compact" : "default"}
							/>
						))
					)}
					{isLoading && messages[messages.length - 1]?.role !== "assistant" && (
						<div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
							<div className="animate-pulse">{localization.CHAT_LOADING}</div>
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Input Area */}
			<div
				className={cn(
					"border-t bg-background p-4",
					isWidget ? "px-3 py-3" : "px-4",
				)}
			>
				<div className={cn(!isWidget && "max-w-3xl mx-auto")}>
					<ChatInput
						input={input}
						handleInputChange={handleInputChange}
						handleSubmit={handleSubmit}
						isLoading={isLoading}
						placeholder={localization.CHAT_PLACEHOLDER}
						variant={isWidget ? "compact" : "default"}
					/>
				</div>
			</div>
		</div>
	);
}
