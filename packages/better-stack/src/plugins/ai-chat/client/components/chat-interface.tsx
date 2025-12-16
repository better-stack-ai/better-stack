"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChatMessage } from "./chat-message";
import { ChatInput, type AttachedFile } from "./chat-input";
import { BetterStackAttribution } from "@workspace/ui/components/better-stack-attribution";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cn } from "@workspace/ui/lib/utils";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";
import { createApiClient } from "@btst/stack/plugins/client";
import type { AiChatApiRouter } from "../../api/plugin";
import { createAiChatQueryKeys } from "../../query-keys";
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
	/** Called whenever messages change (for persistence). Only fires in public mode. */
	onMessagesChange?: (messages: UIMessage[]) => void;
}

export function ChatInterface({
	apiPath = "/api/chat",
	initialMessages,
	id,
	variant = "full",
	className,
	onMessagesChange,
}: ChatInterfaceProps) {
	const {
		navigate,
		localization: customLocalization,
		apiBaseURL,
		apiBasePath,
		headers,
		mode,
		showAttribution,
		chatSuggestions,
	} = usePluginOverrides<AiChatPluginOverrides, Partial<AiChatPluginOverrides>>(
		"ai-chat",
		{ showAttribution: true },
	);
	const basePath = useBasePath();
	const isPublicMode = mode === "public";

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };
	const queryClient = useQueryClient();

	const conversationsListQueryKey = useMemo(() => {
		// In public mode, we don't need conversation queries
		if (isPublicMode) return ["ai-chat", "disabled"];
		const client = createApiClient<AiChatApiRouter>({
			baseURL: apiBaseURL,
			basePath: apiBasePath,
		});
		const queries = createAiChatQueryKeys(client, headers);
		return queries.conversations.list().queryKey;
	}, [apiBaseURL, apiBasePath, headers, isPublicMode]);

	// Track the current conversation ID - initialized from prop, updated after first message
	// In public mode, we don't track conversation IDs
	const [currentConversationId, setCurrentConversationId] = useState<
		string | undefined
	>(isPublicMode ? undefined : id);
	// Track if we've sent the first message on a new chat (to trigger navigation)
	const isFirstMessageSentRef = useRef(false);
	const hasNavigatedRef = useRef(false);

	// Update currentConversationId when id prop changes (e.g., navigating to different conversation)
	useEffect(() => {
		if (!isPublicMode) {
			setCurrentConversationId(id);
			isFirstMessageSentRef.current = false;
			hasNavigatedRef.current = false;
		}
	}, [id, isPublicMode]);

	// Fetch existing conversation messages when id is provided (authenticated mode only)
	const { conversation, isLoading: isLoadingConversation } = useConversation(
		id,
		{ enabled: !!id && !isPublicMode },
	);

	// Fetch conversations list for navigation after first message (authenticated mode only)
	const { conversations } = useConversations({ enabled: !isPublicMode });

	// Use a ref to track the conversation ID for the transport body
	// This ensures the transport always uses the latest value
	// In public mode, always undefined
	const conversationIdRef = useRef<string | undefined>(
		isPublicMode ? undefined : id,
	);
	useEffect(() => {
		if (!isPublicMode) {
			conversationIdRef.current = currentConversationId;
		}
	}, [currentConversationId, isPublicMode]);

	// Ref to track edit operation with messages to use
	const editMessagesRef = useRef<UIMessage[] | null>(null);

	// Track if we've finished initializing messages
	// This prevents onMessagesChange from firing with an empty array before initialMessages are loaded
	// Without this guard, the effect would fire on mount with [], overwriting any saved messages
	const [isMessagesInitialized, setIsMessagesInitialized] = useState(
		() =>
			// Start as initialized if there are no initialMessages to load
			!initialMessages || initialMessages.length === 0,
	);

	// Memoize the transport to prevent recreation on every render
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: apiPath,
				// In public mode, don't send conversationId
				body: isPublicMode
					? undefined
					: () => ({ conversationId: conversationIdRef.current }),
				// Handle edit operations by using truncated messages from the ref
				prepareSendMessagesRequest: ({ messages: hookMessages }) => {
					// If we're in an edit operation, use the truncated messages + new user message
					if (editMessagesRef.current !== null) {
						const newUserMessage = hookMessages[hookMessages.length - 1];
						const messagesToSend = [...editMessagesRef.current];
						if (newUserMessage) {
							messagesToSend.push(newUserMessage);
						}
						// Clear the ref after use
						editMessagesRef.current = null;
						return {
							body: {
								messages: messagesToSend,
								conversationId: conversationIdRef.current,
							},
						};
					}
					// Normal case - use the messages as-is
					return {
						body: {
							messages: hookMessages,
							conversationId: conversationIdRef.current,
						},
					};
				},
			}),
		[apiPath, isPublicMode],
	);

	const { messages, sendMessage, status, error, setMessages, regenerate } =
		useChat({
			transport,
			onError: (err) => {
				console.error("useChat onError:", err);
			},
			onFinish: async () => {
				// In public mode, skip all persistence-related operations
				if (isPublicMode) return;

				// Invalidate conversation list to show new/updated conversations
				await queryClient.invalidateQueries({
					queryKey: conversationsListQueryKey,
				});

				// If this was the first message on a new chat, update the URL without full navigation
				// This avoids losing the in-memory messages during component remount
				if (isFirstMessageSentRef.current && !id && !hasNavigatedRef.current) {
					hasNavigatedRef.current = true;
					// Wait for the invalidation to complete and refetch conversations
					await queryClient.refetchQueries({
						queryKey: conversationsListQueryKey,
					});
					// Get the updated conversations from cache
					const cachedConversations = queryClient.getQueryData<
						SerializedConversation[]
					>(conversationsListQueryKey);
					if (cachedConversations && cachedConversations.length > 0) {
						// The most recently updated conversation should be the one we just created
						const newConversation = cachedConversations[0];
						if (newConversation) {
							// Update our local state
							setCurrentConversationId(newConversation.id);
							conversationIdRef.current = newConversation.id;
							// Update URL without navigation to preserve in-memory messages
							// Use replaceState to avoid adding to history stack
							const newUrl = `${basePath}/chat/${newConversation.id}`;
							if (typeof window !== "undefined") {
								window.history.replaceState(
									{ ...window.history.state },
									"",
									newUrl,
								);
							}
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
				.map((m) => {
					// Try to parse content as JSON parts (new format with images)
					let parts: UIMessage["parts"];
					try {
						const parsed = JSON.parse(m.content);
						if (Array.isArray(parsed)) {
							parts = parsed;
						} else {
							// Fallback: wrap as text
							parts = [{ type: "text" as const, text: m.content }];
						}
					} catch {
						// Not JSON - legacy format, wrap as text
						parts = [{ type: "text" as const, text: m.content }];
					}
					return {
						id: m.id,
						role: m.role as "user" | "assistant" | "system",
						parts,
					};
				});
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
			// Mark as initialized - this is batched with setMessages so both take effect in the same render
			setIsMessagesInitialized(true);
		}
	}, [initialMessages, setMessages, messages.length]);

	const [input, setInput] = useState("");
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
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

	// Notify parent when messages change (for persistence in public mode)
	// Only fire after initialization to prevent overwriting saved messages with an empty array
	useEffect(() => {
		if (isPublicMode && onMessagesChange && isMessagesInitialized) {
			onMessagesChange(messages);
		}
	}, [messages, isPublicMode, onMessagesChange, isMessagesInitialized]);

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
	};

	const handleSubmit = async (
		e: React.FormEvent<HTMLFormElement>,
		files?: AttachedFile[],
	) => {
		e.preventDefault();
		const text = input.trim();
		// Allow submit if there's text OR files
		if (!text && (!files || files.length === 0)) return;

		// Track if this is the first message on a new chat (authenticated mode only)
		if (!isPublicMode && !id && messages.length === 0) {
			isFirstMessageSentRef.current = true;
		}

		// Save current values before clearing - we'll restore them if send fails
		const savedInput = input;
		const savedFiles = files ? [...files] : [];

		// Clear input immediately (optimistically) - the AI SDK renders messages optimistically,
		// so we need to clear the input before the message appears to avoid duplicate text
		setInput("");
		setAttachedFiles([]);

		try {
			// Use AI SDK's file attachment format
			// The SDK automatically converts supported file types (images, text) to the correct format
			if (files && files.length > 0) {
				// Convert AttachedFile[] to FileUIPart[] format expected by AI SDK
				const fileUIParts = files.map((file) => ({
					type: "file" as const,
					mediaType: file.mediaType,
					url: file.url,
					filename: file.filename,
				}));

				await sendMessage({
					text: text || "", // AI SDK requires text, even if empty
					files: fileUIParts,
				});
			} else {
				await sendMessage({ text });
			}
		} catch (error) {
			// Restore input on failure so user can retry
			setInput(savedInput);
			setAttachedFiles(savedFiles);
			console.error("Error sending message:", error);
		}
	};

	const isLoading = status === "streaming" || status === "submitted";

	// Handler for retrying/regenerating the last AI response
	const handleRetry = useCallback(() => {
		regenerate();
	}, [regenerate]);

	// Pending edit state - stores the text to send after messages are truncated
	const [pendingEdit, setPendingEdit] = useState<{
		text: string;
		expectedLength: number;
	} | null>(null);

	// Effect to send the edited message after React has processed the truncation
	useEffect(() => {
		if (pendingEdit && messages.length === pendingEdit.expectedLength) {
			const textToSend = pendingEdit.text;
			setPendingEdit(null);
			sendMessage({ text: textToSend });
		}
	}, [messages.length, pendingEdit, sendMessage]);

	// Handler for editing a user message - replaces the message and all subsequent messages
	const handleEditMessage = useCallback(
		(messageId: string, newText: string) => {
			const messageIndex = messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return;

			// Get the message to edit
			const messageToEdit = messages[messageIndex];
			if (!messageToEdit || messageToEdit.role !== "user") return;

			// Truncate to BEFORE the edited message (remove it and all subsequent)
			const truncatedMessages = messages.slice(0, messageIndex);

			// Store the truncated messages in the ref for the transport to use
			editMessagesRef.current = truncatedMessages;

			// Set the pending edit - the useEffect will send after truncation is processed
			setPendingEdit({ text: newText, expectedLength: messageIndex });

			// Truncate the messages - React will batch this and the useEffect will fire after
			setMessages(truncatedMessages);
		},
		[messages, setMessages],
	);

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
								<div className="flex flex-col h-full min-h-[300px]">
									<div className="flex-1 flex items-center justify-center text-muted-foreground">
										<p>{localization.CHAT_EMPTY_STATE}</p>
									</div>
									{chatSuggestions && chatSuggestions.length > 0 && (
										<div className="flex flex-wrap justify-center gap-2 pb-4 max-w-md mx-auto">
											{chatSuggestions.map((suggestion, index) => (
												<button
													key={index}
													type="button"
													onClick={() => setInput(suggestion)}
													className="px-3 py-2 text-sm rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-foreground"
												>
													{suggestion}
												</button>
											))}
										</div>
									)}
								</div>
							) : (
								messages.map((m, index) => (
									<ChatMessage
										key={m.id || `msg-${index}`}
										message={m}
										isStreaming={
											status === "streaming" &&
											m.id === messages[messages.length - 1]?.id &&
											m.role === "assistant"
										}
										variant={isWidget ? "compact" : "default"}
										onRetry={
											// Only show retry on the last assistant message
											m.role === "assistant" && index === messages.length - 1
												? handleRetry
												: undefined
										}
										onEdit={
											// Allow editing user messages
											m.role === "user"
												? (newText) => handleEditMessage(m.id, newText)
												: undefined
										}
										isRetrying={isLoading && m.role === "assistant"}
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
							{error && (
								<div className="flex items-center gap-2 text-destructive text-sm py-4 px-3 bg-destructive/10 rounded-md">
									<span>{localization.CHAT_ERROR}</span>
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
						onFilesAttached={setAttachedFiles}
						attachedFiles={attachedFiles}
					/>
					{showAttribution && <BetterStackAttribution />}
				</div>
			</div>
		</>
	);
}
