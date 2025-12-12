"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cn } from "@workspace/ui/lib/utils";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";
import {
	useConversation,
	useConversations,
	type SerializedConversation,
} from "../hooks/chat-hooks";

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
	const { navigate, localization: customLocalization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});
	const basePath = useBasePath();

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };
	const queryClient = useQueryClient();

	// Track the current conversation ID - initialized from prop, updated after first message
	const [currentConversationId, setCurrentConversationId] = useState<
		string | undefined
	>(id);
	// Track if we've sent the first message on a new chat (to trigger navigation)
	const isFirstMessageSentRef = useRef(false);
	const hasNavigatedRef = useRef(false);

	// Update currentConversationId when id prop changes (e.g., navigating to different conversation)
	useEffect(() => {
		setCurrentConversationId(id);
		isFirstMessageSentRef.current = false;
		hasNavigatedRef.current = false;
	}, [id]);

	// Fetch existing conversation messages when id is provided
	const { conversation, isLoading: isLoadingConversation } = useConversation(
		id,
		{ enabled: !!id },
	);

	// Fetch conversations list for navigation after first message
	const { conversations } = useConversations();

	// Use a ref to track the conversation ID for the transport body
	// This ensures the transport always uses the latest value
	const conversationIdRef = useRef<string | undefined>(id);
	useEffect(() => {
		conversationIdRef.current = currentConversationId;
	}, [currentConversationId]);

	// Memoize the transport to prevent recreation on every render
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: apiPath,
				body: () => ({ conversationId: conversationIdRef.current }),
			}),
		[apiPath],
	);

	const { messages, sendMessage, status, error, setMessages } = useChat({
		transport,
		onError: (err) => {
			console.error("useChat onError:", err);
		},
		onFinish: async () => {
			// Invalidate conversation list to show new/updated conversations
			await queryClient.invalidateQueries({
				queryKey: ["conversations", "list"],
			});

			// If this was the first message on a new chat, navigate to the new conversation
			if (
				isFirstMessageSentRef.current &&
				!id &&
				!hasNavigatedRef.current &&
				navigate
			) {
				hasNavigatedRef.current = true;
				// Wait for the invalidation to complete and refetch conversations
				await queryClient.refetchQueries({
					queryKey: ["conversations", "list"],
				});
				// Get the updated conversations from cache
				const cachedConversations = queryClient.getQueryData<
					SerializedConversation[]
				>(["conversations", "list", "list"]);
				if (cachedConversations && cachedConversations.length > 0) {
					// The most recently updated conversation should be the one we just created
					const newConversation = cachedConversations[0];
					if (newConversation) {
						// Update our local state
						setCurrentConversationId(newConversation.id);
						conversationIdRef.current = newConversation.id;
						// Navigate to the new conversation URL
						navigate(`${basePath}/chat/${newConversation.id}`);
					}
				}
			}
		},
	});

	// Load existing conversation messages when navigating to a conversation
	useEffect(() => {
		if (
			conversation?.messages &&
			conversation.messages.length > 0 &&
			messages.length === 0
		) {
			// Filter out "data" role messages as UIMessage only accepts "user" | "assistant" | "system"
			const uiMessages: UIMessage[] = conversation.messages
				.filter((m) => m.role !== "data")
				.map((m) => ({
					id: m.id,
					role: m.role as "user" | "assistant" | "system",
					parts: [{ type: "text" as const, text: m.content }],
				}));
			setMessages(uiMessages);
		}
	}, [conversation, messages.length, setMessages]);

	// Set initial messages on mount (for SSR hydration)
	useEffect(() => {
		if (
			initialMessages &&
			initialMessages.length > 0 &&
			messages.length === 0
		) {
			setMessages(initialMessages);
		}
	}, [initialMessages, setMessages, messages.length]);

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

		// Track if this is the first message on a new chat
		if (!id && messages.length === 0) {
			isFirstMessageSentRef.current = true;
		}

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
		<>
			<div className="flex-1 overflow-hidden">
				<div
					className={cn(
						"flex flex-col h-full w-full bg-background",
						isWidget && "rounded-xl",
						className,
					)}
					data-testid="chat-interface"
				>
					{/* Messages Area */}
					<ScrollArea ref={scrollRef} className="flex-1 h-full">
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
							{isLoading &&
								messages[messages.length - 1]?.role !== "assistant" && (
									<div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
										<div className="animate-pulse">
											{localization.CHAT_LOADING}
										</div>
									</div>
								)}
						</div>
					</ScrollArea>
				</div>
			</div>
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
		</>
	);
}
