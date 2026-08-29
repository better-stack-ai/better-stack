"use client";

import { useChat } from "@ai-sdk/react";
import {
	useEffect,
	useRef,
	useState,
	useMemo,
	useCallback,
	useLayoutEffect,
	useId,
} from "react";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { ChatMessage } from "./chat-message";
import { ChatInput, type AttachedFile } from "./chat-input";
import { StackAttribution } from "@workspace/ui/components/stack-attribution";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import { cn } from "@workspace/ui/lib/utils";
import {
	PermissionCheck,
	usePluginOverrides,
	useStack,
} from "@btst/stack/context";
import { aiChatPermissions } from "../../permissions";
import {
	resolveAiChatApiUrl,
	resolveAiChatMode,
	resolveAiChatSiteLocation,
	type AiChatPluginOverrides,
} from "../overrides";
import { useAiChatTranslation } from "../localization";
import { createApiClient } from "@btst/stack/plugins/client";
import type { AiChatApiRouter } from "../../api/plugin";
import { aiChatIdentityKey, createAiChatQueryKeys } from "../../query-keys";
import {
	useConversation,
	useConversations,
	useAiChatIdentityPartition,
	type SerializedMessage,
} from "../hooks/chat-hooks";
import { usePageAIContext } from "../context/page-ai-context";
import { navigateAiChatCrossOrigin } from "../navigation";

interface ChatInterfaceProps {
	initialMessages?: UIMessage[];
	id?: string;
	/** Variant: 'full' for full-page layout, 'widget' for embedded widget */
	variant?: "full" | "widget";
	className?: string;
	/** Called whenever messages change (for persistence). Only fires in public mode. */
	onMessagesChange?: (messages: UIMessage[]) => void;
}

type ChatAction = "send" | "edit" | "retry";

function reconcilePersistedMessageIds(
	messages: UIMessage[],
	persistedMessages: SerializedMessage[],
): UIMessage[] | null {
	const userMessages = messages.filter((message) => message.role === "user");
	const persistedUserMessages = persistedMessages.filter(
		(message) => message.role === "user",
	);
	if (persistedUserMessages.length !== userMessages.length) return null;
	const persistedIds = new Map<UIMessage, string>();
	for (let index = 0; index < userMessages.length; index++) {
		const message = userMessages[index];
		const persisted = persistedUserMessages[index];
		if (!message || !persisted) return null;
		const serializedParts = JSON.stringify(message.parts);
		const legacyText =
			message.parts.length === 1 && message.parts[0]?.type === "text"
				? message.parts[0].text
				: undefined;
		if (
			persisted.content !== serializedParts &&
			persisted.content !== legacyText
		) {
			return null;
		}
		persistedIds.set(message, persisted.id);
	}
	return messages.map((message) => ({
		...message,
		id: persistedIds.get(message) ?? message.id,
	}));
}

function persistedMessagesToUiMessages(
	messages: readonly SerializedMessage[],
): UIMessage[] {
	return messages
		.filter((message) => message.role !== "data")
		.map((message) => {
			let parts: UIMessage["parts"];
			try {
				const parsed = JSON.parse(message.content);
				parts = Array.isArray(parsed)
					? parsed
					: [{ type: "text" as const, text: message.content }];
			} catch {
				parts = [{ type: "text" as const, text: message.content }];
			}
			return {
				id: message.id,
				role: message.role as "user" | "assistant" | "system",
				parts,
			};
		});
}

function ChatActionCheck({
	publicMode,
	action,
	conversationId,
	ownerId,
	messageId,
	toolNames = [],
	routeName,
	children,
}: {
	publicMode: boolean;
	action: ChatAction;
	conversationId?: string;
	ownerId?: string;
	messageId?: string;
	toolNames?: readonly string[];
	routeName?: string;
	children: (allowed: boolean) => React.ReactNode;
}) {
	if (publicMode) return <>{children(true)}</>;
	const base = {
		...(conversationId ? { conversationId } : {}),
		...(ownerId ? { ownerId } : {}),
	};
	const streamPermission = aiChatPermissions.stream.start({
		...base,
		createsConversation: !conversationId,
		intent: action,
	});
	const messagePermission =
		action === "send"
			? aiChatPermissions.message.send({
					...base,
					createsConversation: !conversationId,
				})
			: action === "edit" && conversationId && messageId
				? aiChatPermissions.message.edit({
						conversationId,
						...(ownerId ? { ownerId } : {}),
						messageId,
					})
				: action === "retry" && conversationId && messageId
					? aiChatPermissions.message.retry({
							conversationId,
							...(ownerId ? { ownerId } : {}),
							messageId,
						})
					: null;
	if (!messagePermission) return <>{children(false)}</>;

	return (
		<PermissionCheck permission={streamPermission}>
			{(streamState) => (
				<PermissionCheck permission={messagePermission}>
					{(messageState) => {
						const baseAllowed =
							streamState.can &&
							!streamState.isPending &&
							!streamState.error &&
							messageState.can &&
							!messageState.isPending &&
							!messageState.error;
						const renderToolCheck = (allowed: boolean) => {
							if (!allowed || toolNames.length === 0) return children(allowed);
							return (
								<PermissionCheck
									permission={aiChatPermissions.tool.activate({
										...base,
										...(routeName ? { routeName } : {}),
										toolNames: [...toolNames],
									})}
								>
									{(toolState) =>
										children(
											toolState.can && !toolState.isPending && !toolState.error,
										)
									}
								</PermissionCheck>
							);
						};
						if (action !== "send" || conversationId) {
							return renderToolCheck(Boolean(baseAllowed));
						}
						return (
							<PermissionCheck
								permission={aiChatPermissions.conversation.create()}
							>
								{(createState) =>
									renderToolCheck(
										Boolean(baseAllowed) &&
											createState.can &&
											!createState.isPending &&
											!createState.error,
									)
								}
							</PermissionCheck>
						);
					}}
				</PermissionCheck>
			)}
		</PermissionCheck>
	);
}

function PermissionedChatMessage({
	publicMode,
	action,
	conversationId,
	ownerId,
	messageId,
	...messageProps
}: React.ComponentProps<typeof ChatMessage> & {
	publicMode: boolean;
	action?: "edit" | "retry";
	conversationId?: string;
	ownerId?: string;
	messageId?: string;
}) {
	if (!action) return <ChatMessage {...messageProps} />;
	return (
		<ChatActionCheck
			publicMode={publicMode}
			action={action}
			conversationId={conversationId}
			ownerId={ownerId}
			messageId={messageId}
		>
			{(allowed) => (
				<ChatMessage
					{...messageProps}
					onRetry={allowed ? messageProps.onRetry : undefined}
					onEdit={allowed ? messageProps.onEdit : undefined}
				/>
			)}
		</ChatActionCheck>
	);
}

export function ChatInterface({
	initialMessages,
	id,
	variant = "full",
	className,
	onMessagesChange,
}: ChatInterfaceProps) {
	const {
		localization: customLocalization,
		showAttribution,
		chatSuggestions,
	} = usePluginOverrides<AiChatPluginOverrides, Partial<AiChatPluginOverrides>>(
		"aiChat",
		{ showAttribution: true },
	);
	const {
		api,
		basePath: stackBasePath,
		plugins,
		queryClient: stackQueryClient,
	} = useStack();
	const aiChatApi = plugins?.aiChat?.api;
	const apiBaseURL = aiChatApi?.baseURL ?? api?.baseURL;
	const apiBasePath = aiChatApi?.basePath ?? api?.basePath;
	const browserHeaders = aiChatApi?.browserHeaders;
	const credentials = aiChatApi?.credentials;
	const resolvedApiPath = resolveAiChatApiUrl(apiBaseURL, apiBasePath);
	const mode = resolveAiChatMode(plugins?.aiChat?.config);
	const siteBaseURL = plugins?.aiChat?.site.baseURL;
	const siteBasePath = plugins?.aiChat?.site.basePath ?? stackBasePath;
	const isPublicMode = mode === "public";

	// Read page AI context registered by the current page
	const pageAIContext = usePageAIContext();

	const tr = useAiChatTranslation(customLocalization);
	const queryClient = useQueryClient(stackQueryClient);
	const identityPartition = useAiChatIdentityPartition();
	const chatInstanceId = useId();
	const identityPartitionKey = hashKey([aiChatIdentityKey(identityPartition)]);
	const latestIdentityPartitionKey = useRef(identityPartitionKey);
	const identitySessionGeneration = useRef(0);
	const [identitySessionVersion, setIdentitySessionVersion] = useState(0);
	const activeStreamPartitionKey = useRef<string | undefined>(undefined);
	const nextStreamRequestGeneration = useRef(0);
	const latestStreamRequestGeneration = useRef(0);
	const pendingStreamRequests = useRef<
		Array<{ generation: number; identityPartitionKey: string }>
	>([]);
	const latestMessages = useRef<UIMessage[]>([]);

	const conversationsListQueryKey = useMemo(() => {
		// In public mode, we don't need conversation queries
		if (isPublicMode) return ["ai-chat", "disabled"];
		const client = createApiClient<AiChatApiRouter>({
			baseURL: apiBaseURL,
			basePath: apiBasePath,
			credentials,
		});
		const queries = createAiChatQueryKeys(client, browserHeaders);
		return queries.conversations.list(identityPartition).queryKey;
	}, [
		apiBaseURL,
		apiBasePath,
		browserHeaders,
		credentials,
		identityPartition,
		isPublicMode,
	]);
	const latestIdentityPartition = useRef(identityPartition);
	const latestConversationsListQueryKey = useRef(conversationsListQueryKey);
	const latestHeaders = useRef(browserHeaders);

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
			// Reset edit flag on navigation
			isEditInProgressRef.current = false;
		}
	}, [id, isPublicMode]);

	// Fetch existing conversation messages when id is provided (authenticated mode only)
	const { conversation, isLoading: isLoadingConversation } = useConversation(
		id,
		{ enabled: !!id && !isPublicMode },
	);

	// Fetch conversations list for navigation after first message (authenticated mode only)
	const { conversations } = useConversations({ enabled: !isPublicMode });
	const currentConversationOwnerId =
		conversation?.userId ??
		conversations.find((item) => item.id === currentConversationId)?.userId ??
		(!isPublicMode &&
		currentConversationId &&
		typeof identityPartition === "object"
			? identityPartition.id
			: undefined);

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

	// Flag to prevent load conversation effect from overwriting messages during edit
	const isEditInProgressRef = useRef(false);

	// Track if we've finished initializing messages
	// This prevents onMessagesChange from firing with an empty array before initialMessages are loaded
	// Without this guard, the effect would fire on mount with [], overwriting any saved messages
	const [isMessagesInitialized, setIsMessagesInitialized] = useState(
		() =>
			// Start as initialized if there are no initialMessages to load
			!initialMessages || initialMessages.length === 0,
	);
	const [input, setInput] = useState("");
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
	const [pendingEdit, setPendingEdit] = useState<{
		text: string;
		expectedLength: number;
		identityPartitionKey: string;
		streamRequestGeneration: number;
	} | null>(null);
	const [historySyncError, setHistorySyncError] = useState<Error | null>(null);
	const [isHistorySyncRetrying, setIsHistorySyncRetrying] = useState(false);
	useEffect(() => {
		setHistorySyncError(null);
		setIsHistorySyncRetrying(false);
	}, [id, isPublicMode]);

	// Ref to always have the latest pageAIContext in the transport callback
	// without recreating the transport on every context change
	const pageAIContextRef = useRef(pageAIContext);
	useEffect(() => {
		pageAIContextRef.current = pageAIContext;
	}, [pageAIContext]);

	// Memoize the transport to prevent recreation on every render
	const transport = useMemo(() => {
		const trackedFetch = Object.assign(
			async (
				request: Parameters<typeof globalThis.fetch>[0],
				init?: Parameters<typeof globalThis.fetch>[1],
			) => {
				const requestIdentityPartitionKey = latestIdentityPartitionKey.current;
				const requestGeneration = latestStreamRequestGeneration.current;
				const response = await globalThis.fetch(request, init);
				if (
					!isPublicMode &&
					requestIdentityPartitionKey === latestIdentityPartitionKey.current &&
					requestGeneration === latestStreamRequestGeneration.current
				) {
					const conversationId = response.headers.get("x-conversation-id");
					if (conversationId) conversationIdRef.current = conversationId;
				}
				return response;
			},
			globalThis.fetch,
		) as typeof globalThis.fetch;
		return new DefaultChatTransport({
			api: resolvedApiPath,
			headers: browserHeaders,
			credentials,
			fetch: trackedFetch,
			// In public mode, don't send conversationId
			body: isPublicMode
				? undefined
				: () => ({ conversationId: conversationIdRef.current }),
			// Handle edit operations and inject page context
			prepareSendMessagesRequest: ({ messages: hookMessages }) => {
				if (!isPublicMode) {
					const generation = ++nextStreamRequestGeneration.current;
					latestStreamRequestGeneration.current = generation;
					const request = {
						generation,
						identityPartitionKey: latestIdentityPartitionKey.current,
					};
					pendingStreamRequests.current.push(request);
					activeStreamPartitionKey.current = request.identityPartitionKey;
				}
				const currentPageContext = pageAIContextRef.current;

				// Build page context fields to include in every request
				const pageContextBody = currentPageContext?.pageDescription
					? {
							pageContext: currentPageContext.pageDescription,
							availableTools: Object.keys(currentPageContext.clientTools ?? {}),
							routeName: currentPageContext.routeName,
						}
					: {};

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
							...pageContextBody,
						},
					};
				}
				// Normal case - use the messages as-is
				return {
					body: {
						messages: hookMessages,
						conversationId: conversationIdRef.current,
						...pageContextBody,
					},
				};
			},
		});
	}, [browserHeaders, credentials, isPublicMode, resolvedApiPath]);

	// Use a ref so addToolOutput is always current inside the onToolCall closure
	const addToolOutputRef = useRef<
		ReturnType<typeof useChat>["addToolOutput"] | null
	>(null);

	const {
		messages,
		sendMessage,
		status,
		error,
		setMessages,
		regenerate,
		addToolOutput,
		stop,
	} = useChat({
		id: `${chatInstanceId}:${isPublicMode ? "public" : identitySessionVersion}`,
		transport,
		// Automatically resubmit after all client-side tool results are provided
		sendAutomaticallyWhen: (options) =>
			(isPublicMode ||
				identitySessionVersion === identitySessionGeneration.current) &&
			lastAssistantMessageIsCompleteWithToolCalls(options),
		onToolCall: async ({ toolCall }) => {
			const toolRequest = pendingStreamRequests.current.at(-1);
			if (
				!isPublicMode &&
				(identitySessionVersion !== identitySessionGeneration.current ||
					!toolRequest ||
					toolRequest.identityPartitionKey !==
						latestIdentityPartitionKey.current ||
					toolRequest.generation !== latestStreamRequestGeneration.current ||
					activeStreamPartitionKey.current !== toolRequest.identityPartitionKey)
			) {
				return;
			}
			const toolIdentityPartitionKey =
				toolRequest?.identityPartitionKey ?? latestIdentityPartitionKey.current;
			const toolStreamRequestGeneration =
				toolRequest?.generation ?? latestStreamRequestGeneration.current;
			const toolRequestIsCurrent = () =>
				isPublicMode ||
				(identitySessionVersion === identitySessionGeneration.current &&
					toolIdentityPartitionKey === latestIdentityPartitionKey.current &&
					toolStreamRequestGeneration ===
						latestStreamRequestGeneration.current);
			// Dispatch client-side tool calls to the handler registered by the current page.
			// In AI SDK v5, onToolCall returns void — addToolOutput must be called explicitly.
			const toolName = toolCall.toolName;
			const handler = pageAIContextRef.current?.clientTools?.[toolName];
			if (handler) {
				try {
					const result = await handler(toolCall.input);
					if (!toolRequestIsCurrent()) return;
					// No await — avoids potential deadlocks with sendAutomaticallyWhen
					addToolOutputRef.current?.({
						tool: toolName,
						toolCallId: toolCall.toolCallId,
						output: result,
					});
				} catch (err) {
					if (!toolRequestIsCurrent()) return;
					addToolOutputRef.current?.({
						tool: toolName,
						toolCallId: toolCall.toolCallId,
						state: "output-error",
						errorText:
							err instanceof Error
								? err.message
								: tr(
										"TOOL_EXECUTION_FAILED",
										"aiChat.tools.executionFailed",
										"Tool execution failed",
									),
					});
				}
			} else {
				// No handler found — this happens when the user navigates away while a
				// tool-call response is streaming and the page context changes. Always
				// call addToolOutput so sendAutomaticallyWhen can unblock; without this
				// the conversation gets permanently stuck waiting for a missing output.
				addToolOutputRef.current?.({
					tool: toolName,
					toolCallId: toolCall.toolCallId,
					state: "output-error",
					errorText: tr(
						"TOOL_HANDLER_MISSING",
						"aiChat.tools.handlerMissing",
						'No client-side handler registered for tool "{{toolName}}". The page context may have changed while the response was streaming.',
						{ toolName },
					),
				});
			}
		},
		onError: (err) => {
			console.error("useChat onError:", err);
			if (
				!isPublicMode &&
				identitySessionVersion !== identitySessionGeneration.current
			) {
				return;
			}
			const failedRequest = pendingStreamRequests.current[0];
			const failedPartitionKey =
				failedRequest?.identityPartitionKey ?? activeStreamPartitionKey.current;
			if (
				!isPublicMode &&
				failedPartitionKey !== latestIdentityPartitionKey.current
			) {
				return;
			}
			// AI SDK invokes onFinish after onError. Keep this request queued so
			// onFinish can reconcile a user message that the backend persisted before
			// the provider or response stream failed.
		},
		onFinish: async () => {
			// In public mode, skip all persistence-related operations
			if (isPublicMode) {
				activeStreamPartitionKey.current = undefined;
				return;
			}
			if (identitySessionVersion !== identitySessionGeneration.current) {
				return;
			}
			const finishedRequest = pendingStreamRequests.current.shift();
			const finishingPartitionKey =
				finishedRequest?.identityPartitionKey ??
				activeStreamPartitionKey.current;
			if (finishingPartitionKey !== latestIdentityPartitionKey.current) {
				return;
			}
			if (
				!finishedRequest ||
				finishedRequest.generation === latestStreamRequestGeneration.current
			) {
				activeStreamPartitionKey.current = undefined;
			}
			const identityIsCurrent = () =>
				finishingPartitionKey === latestIdentityPartitionKey.current &&
				(!finishedRequest ||
					finishedRequest.generation === latestStreamRequestGeneration.current);
			const finishingIdentityPartition = latestIdentityPartition.current;
			const finishingConversationsListQueryKey =
				latestConversationsListQueryKey.current;
			const finishingHeaders = latestHeaders.current;

			try {
				// Invalidate conversation list to show new/updated conversations
				await queryClient.invalidateQueries({
					queryKey: finishingConversationsListQueryKey,
				});
				if (!identityIsCurrent()) return;

				// If this was the first message on a new chat, update the URL without full navigation
				// This avoids losing the in-memory messages during component remount
				if (isFirstMessageSentRef.current && !hasNavigatedRef.current) {
					const discoveredConversationId = conversationIdRef.current;
					if (discoveredConversationId) {
						hasNavigatedRef.current = true;
						setCurrentConversationId(discoveredConversationId);
						conversationIdRef.current = discoveredConversationId;
						// Only update the URL in full-page mode; in widget mode the chat is
						// embedded in another page and clobbering the URL is disruptive.
						if (variant === "full") {
							const newLocation = resolveAiChatSiteLocation(
								{ baseURL: siteBaseURL, basePath: siteBasePath },
								typeof window === "undefined"
									? undefined
									: window.location.origin,
								"chat",
								discoveredConversationId,
							);
							if (typeof window !== "undefined") {
								if (newLocation.crossOrigin) {
									navigateAiChatCrossOrigin(newLocation.href, {
										replace: true,
									});
								} else {
									window.history.replaceState(
										{ ...window.history.state },
										"",
										newLocation.path,
									);
								}
							}
						}
					}
				}

				const persistedConversationId = conversationIdRef.current;
				if (!persistedConversationId || !identityIsCurrent()) {
					if (isFirstMessageSentRef.current) {
						isFirstMessageSentRef.current = false;
						hasNavigatedRef.current = false;
						throw new Error(
							"The persisted conversation id could not be discovered.",
						);
					}
					return;
				}
				const client = createApiClient<AiChatApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
					credentials,
				});
				const detailQuery = createAiChatQueryKeys(
					client,
					finishingHeaders,
				).conversations.detail(
					persistedConversationId,
					finishingIdentityPartition,
				);
				await queryClient.cancelQueries({
					queryKey: detailQuery.queryKey,
					exact: true,
				});
				if (!identityIsCurrent()) return;
				queryClient.removeQueries({
					queryKey: detailQuery.queryKey,
					exact: true,
				});
				const persistedConversation = await queryClient.fetchQuery({
					...detailQuery,
					staleTime: 0,
				});
				if (!identityIsCurrent() || !persistedConversation) return;
				const reconciled = reconcilePersistedMessageIds(
					latestMessages.current,
					persistedConversation.messages,
				);
				if (!reconciled) {
					throw new Error(
						"Persisted chat history did not match the streamed transcript.",
					);
				}
				setMessages(reconciled);
				setHistorySyncError(null);
			} catch (error) {
				if (!identityIsCurrent()) return;
				const syncError =
					error instanceof Error ? error : new Error(String(error));
				console.error("Failed to reconcile persisted chat history:", syncError);
				setHistorySyncError(syncError);
				setMessages([]);
			}
		},
	});
	const handleHistorySyncRetry = useCallback(async () => {
		if (isPublicMode || isHistorySyncRetrying) return;
		const retryConversationId = conversationIdRef.current;
		if (!retryConversationId) {
			setHistorySyncError(null);
			return;
		}

		const retryPartitionKey = latestIdentityPartitionKey.current;
		const retrySessionGeneration = identitySessionGeneration.current;
		const retryIsCurrent = () =>
			retryPartitionKey === latestIdentityPartitionKey.current &&
			retrySessionGeneration === identitySessionGeneration.current &&
			retryConversationId === conversationIdRef.current;
		setIsHistorySyncRetrying(true);
		try {
			const client = createApiClient<AiChatApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
				credentials,
			});
			const detailQuery = createAiChatQueryKeys(
				client,
				latestHeaders.current,
			).conversations.detail(
				retryConversationId,
				latestIdentityPartition.current,
			);
			await queryClient.cancelQueries({
				queryKey: detailQuery.queryKey,
				exact: true,
			});
			if (!retryIsCurrent()) return;
			queryClient.removeQueries({
				queryKey: detailQuery.queryKey,
				exact: true,
			});
			const persistedConversation = await queryClient.fetchQuery({
				...detailQuery,
				staleTime: 0,
			});
			if (!retryIsCurrent() || !persistedConversation) return;
			if (isFirstMessageSentRef.current && !hasNavigatedRef.current) {
				hasNavigatedRef.current = true;
				setCurrentConversationId(retryConversationId);
				if (variant === "full" && typeof window !== "undefined") {
					const newLocation = resolveAiChatSiteLocation(
						{ baseURL: siteBaseURL, basePath: siteBasePath },
						window.location.origin,
						"chat",
						retryConversationId,
					);
					if (newLocation.crossOrigin) {
						navigateAiChatCrossOrigin(newLocation.href, { replace: true });
					} else {
						window.history.replaceState(
							{ ...window.history.state },
							"",
							newLocation.path,
						);
					}
				}
			}
			setMessages(
				persistedMessagesToUiMessages(persistedConversation.messages),
			);
			setHistorySyncError(null);
		} catch (error) {
			if (!retryIsCurrent()) return;
			const syncError =
				error instanceof Error ? error : new Error(String(error));
			console.error("Failed to reload persisted chat history:", syncError);
			setHistorySyncError(syncError);
		} finally {
			if (retryIsCurrent()) setIsHistorySyncRetrying(false);
		}
	}, [
		apiBasePath,
		apiBaseURL,
		credentials,
		isHistorySyncRetrying,
		isPublicMode,
		queryClient,
		setMessages,
		siteBasePath,
		siteBaseURL,
		variant,
	]);
	useLayoutEffect(() => {
		latestMessages.current = messages;
	}, [messages]);

	const previousIdentityPartition = useRef(identityPartitionKey);
	useLayoutEffect(() => {
		const nextPartition = identityPartitionKey;
		latestIdentityPartitionKey.current = nextPartition;
		latestIdentityPartition.current = identityPartition;
		latestConversationsListQueryKey.current = conversationsListQueryKey;
		latestHeaders.current = browserHeaders;
		if (isPublicMode) return;
		if (previousIdentityPartition.current === nextPartition) return;
		previousIdentityPartition.current = nextPartition;
		activeStreamPartitionKey.current = undefined;
		pendingStreamRequests.current = [];
		identitySessionGeneration.current += 1;
		setIdentitySessionVersion(identitySessionGeneration.current);
		latestStreamRequestGeneration.current =
			++nextStreamRequestGeneration.current;
		void stop();
		setMessages([]);
		setInput("");
		setAttachedFiles([]);
		setPendingEdit(null);
		setHistorySyncError(null);
		setIsHistorySyncRetrying(false);
		editMessagesRef.current = null;
		isEditInProgressRef.current = false;
		setIsMessagesInitialized(true);
		setCurrentConversationId(id);
		conversationIdRef.current = id;
		isFirstMessageSentRef.current = false;
		hasNavigatedRef.current = false;
	}, [
		conversationsListQueryKey,
		browserHeaders,
		id,
		identityPartition,
		identityPartitionKey,
		isPublicMode,
		setMessages,
		stop,
	]);

	// Keep addToolOutputRef in sync so onToolCall always has the latest reference
	useEffect(() => {
		addToolOutputRef.current = addToolOutput;
	}, [addToolOutput]);

	// Load existing conversation messages when navigating to a conversation
	useEffect(() => {
		// Don't overwrite messages if an edit is in progress
		if (isEditInProgressRef.current) {
			return;
		}
		if (
			conversation?.messages &&
			conversation.messages.length > 0 &&
			messages.length === 0
		) {
			setMessages(persistedMessagesToUiMessages(conversation.messages));
		}
	}, [conversation, messages.length, setMessages]);

	// Set initial messages on mount (for SSR hydration)
	useEffect(() => {
		if (
			!isMessagesInitialized &&
			initialMessages &&
			initialMessages.length > 0 &&
			messages.length === 0
		) {
			setMessages(initialMessages);
			// Mark as initialized - this is batched with setMessages so both take effect in the same render
			setIsMessagesInitialized(true);
		}
	}, [initialMessages, isMessagesInitialized, setMessages, messages.length]);

	const scrollRef = useRef<HTMLDivElement>(null);

	// Track whether the user has manually scrolled away from the bottom.
	// When true, auto-scroll is paused so the user can read earlier context.
	const userHasScrolledRef = useRef(false);
	const prevStatusRef = useRef(status);

	// Reset the scroll lock when a new generation starts so auto-scroll
	// resumes for the next assistant response.
	useEffect(() => {
		if (
			status !== prevStatusRef.current &&
			(status === "streaming" || status === "submitted")
		) {
			userHasScrolledRef.current = false;
		}
		prevStatusRef.current = status;
	}, [status]);

	// Attach a scroll listener to detect when the user scrolls away from the bottom.
	useEffect(() => {
		const viewport = scrollRef.current?.querySelector(
			"[data-radix-scroll-area-viewport]",
		);
		if (!viewport) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = viewport;
			const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
			userHasScrolledRef.current = !isNearBottom;
		};

		viewport.addEventListener("scroll", handleScroll);
		return () => viewport.removeEventListener("scroll", handleScroll);
	}, []);

	// Auto-scroll to bottom when messages change, unless the user has scrolled away
	useEffect(() => {
		if (userHasScrolledRef.current) return;
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

		// Re-enable auto-scroll so the user's own message (and any subsequent
		// error indicator or assistant reply) is scrolled into view.  Without
		// this, if the user had scrolled up earlier, userHasScrolledRef stays
		// true and none of the new content would be auto-scrolled to — and if
		// the request fails before reaching "streaming" status the ref would
		// remain stuck permanently.
		userHasScrolledRef.current = false;

		// Save current values before clearing - we'll restore them if send fails
		const savedInput = input;
		const savedFiles = files ? [...files] : [];
		const sendIdentityPartitionKey = latestIdentityPartitionKey.current;
		const sendIdentitySessionGeneration = identitySessionGeneration.current;

		// Capture the message count before sending so we can restore to this
		// exact point on failure. The SDK may append both a user message and a
		// partial assistant message during streaming — using a fixed snapshot
		// length removes all of them instead of just the last one.
		const messageCountBeforeSend = messages.length;

		// Clear input immediately (optimistically) - the AI SDK renders messages optimistically,
		// so we need to clear the input before the message appears to avoid duplicate text
		setInput("");
		setAttachedFiles([]);
		setHistorySyncError(null);

		try {
			activeStreamPartitionKey.current = latestIdentityPartitionKey.current;
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

				const request = sendMessage({
					text: text || "", // AI SDK requires text, even if empty
					files: fileUIParts,
				});
				await request;
			} else {
				const request = sendMessage({ text });
				await request;
			}
		} catch (error) {
			if (
				activeStreamPartitionKey.current === sendIdentityPartitionKey &&
				sendIdentitySessionGeneration === identitySessionGeneration.current
			) {
				activeStreamPartitionKey.current = undefined;
			}
			if (
				!isPublicMode &&
				(sendIdentityPartitionKey !== latestIdentityPartitionKey.current ||
					sendIdentitySessionGeneration !== identitySessionGeneration.current)
			) {
				return;
			}
			// Restore input on failure so user can retry
			setInput(savedInput);
			setAttachedFiles(savedFiles);
			// Reset first-message tracking so the next attempt still triggers navigation
			if (isFirstMessageSentRef.current && !hasNavigatedRef.current) {
				isFirstMessageSentRef.current = false;
			}
			// Remove all messages the SDK added after our send attempt (optimistic
			// user message AND any partial assistant message from a mid-stream failure).
			setMessages((prev) => prev.slice(0, messageCountBeforeSend));
			console.error("Error sending message:", error);
		}
	};

	const isLoading = status === "streaming" || status === "submitted";

	// Handler for retrying/regenerating the last AI response
	const handleRetry = useCallback(() => {
		setHistorySyncError(null);
		activeStreamPartitionKey.current = latestIdentityPartitionKey.current;
		regenerate();
	}, [regenerate]);

	// Effect to send the edited message after React has processed the truncation
	useEffect(() => {
		if (
			pendingEdit &&
			pendingEdit.identityPartitionKey === latestIdentityPartitionKey.current &&
			pendingEdit.streamRequestGeneration ===
				latestStreamRequestGeneration.current &&
			messages.length === pendingEdit.expectedLength
		) {
			const textToSend = pendingEdit.text;
			setPendingEdit(null);
			// Clear edit in progress flag - the new message will now be sent
			// and we want subsequent effects to work normally
			isEditInProgressRef.current = false;
			activeStreamPartitionKey.current = latestIdentityPartitionKey.current;
			sendMessage({ text: textToSend });
		}
	}, [messages.length, pendingEdit, sendMessage]);

	// Handler for editing a user message - replaces the message and all subsequent messages
	const handleEditMessage = useCallback(
		(messageId: string, newText: string) => {
			setHistorySyncError(null);
			const messageIndex = messages.findIndex((m) => m.id === messageId);
			if (messageIndex === -1) return;

			// Get the message to edit
			const messageToEdit = messages[messageIndex];
			if (!messageToEdit || messageToEdit.role !== "user") return;

			// Truncate to BEFORE the edited message (remove it and all subsequent)
			const truncatedMessages = messages.slice(0, messageIndex);

			// Mark edit in progress to prevent load conversation effect from overwriting
			isEditInProgressRef.current = true;

			// Store the truncated messages in the ref for the transport to use
			editMessagesRef.current = truncatedMessages;

			// Set the pending edit - the useEffect will send after truncation is processed
			setPendingEdit({
				text: newText,
				expectedLength: messageIndex,
				identityPartitionKey: latestIdentityPartitionKey.current,
				streamRequestGeneration: latestStreamRequestGeneration.current,
			});

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
					data-chat-status={status}
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
									<div className="flex-1 flex items-center justify-center text-muted-foreground mb-4">
										<p>
											{tr(
												"CHAT_EMPTY_STATE",
												"aiChat.chat.emptyState",
												"Start a conversation...",
											)}
										</p>
									</div>
									{(() => {
										// Merge static suggestions from overrides with dynamic ones from page context.
										// Page context suggestions appear first (most relevant to current page).
										const pageSuggestions = pageAIContext?.suggestions ?? [];
										const allSuggestions = [
											...pageSuggestions,
											...(chatSuggestions ?? []),
										];
										return allSuggestions.length > 0 ? (
											<div className="flex flex-wrap justify-center gap-2 pb-4 max-w-md mx-auto">
												{allSuggestions.map((suggestion, index) => (
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
										) : null;
									})()}
								</div>
							) : (
								messages.map((m, index) => (
									<PermissionedChatMessage
										key={m.id || `msg-${index}`}
										publicMode={isPublicMode}
										action={
											m.role === "user"
												? "edit"
												: m.role === "assistant" &&
														index === messages.length - 1
													? "retry"
													: undefined
										}
										conversationId={currentConversationId}
										ownerId={currentConversationOwnerId}
										messageId={
											m.role === "assistant"
												? [...messages]
														.slice(0, index)
														.reverse()
														.find((message) => message.role === "user")?.id
												: m.id
										}
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
											{tr("CHAT_LOADING", "aiChat.chat.loading", "Thinking...")}
										</div>
									</div>
								)}
							{(error || historySyncError) && (
								<div className="flex items-center gap-2 text-destructive text-sm py-4 px-3 bg-destructive/10 rounded-md">
									<span className="flex-1">
										{tr(
											"CHAT_ERROR",
											"aiChat.chat.error",
											"Something went wrong. Please try again.",
										)}
									</span>
									{historySyncError && (
										<button
											type="button"
											data-testid="chat-history-retry"
											onClick={() => void handleHistorySyncRetry()}
											disabled={isHistorySyncRetrying}
											className="rounded-md border border-destructive/30 px-2.5 py-1 font-medium hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
										>
											{tr("CHAT_RETRY", "aiChat.chat.retry", "Retry")}
										</button>
									)}
								</div>
							)}
						</div>
					</ScrollArea>
				</div>
			</div>
			{/* Input Area */}
			<ChatActionCheck
				publicMode={isPublicMode}
				action="send"
				conversationId={currentConversationId}
				ownerId={currentConversationOwnerId}
				toolNames={Object.keys(pageAIContext?.clientTools ?? {})}
				routeName={pageAIContext?.routeName}
			>
				{(allowed) =>
					allowed && !historySyncError ? (
						<div
							className={cn(
								"border-t bg-background p-4",
								isWidget ? "px-3 py-3" : "px-4",
							)}
						>
							<div className={cn(!isWidget && "max-w-3xl mx-auto")}>
								<ChatInput
									key={isPublicMode ? "public" : identityPartitionKey}
									input={input}
									handleInputChange={handleInputChange}
									handleSubmit={handleSubmit}
									isLoading={isLoading}
									placeholder={tr(
										"CHAT_PLACEHOLDER",
										"aiChat.chat.placeholder",
										"Type a message...",
									)}
									variant={isWidget ? "compact" : "default"}
									onFilesAttached={setAttachedFiles}
									attachedFiles={attachedFiles}
									allowAttachments={!isPublicMode}
									attachmentPermissionFacts={{
										...(currentConversationId
											? { conversationId: currentConversationId }
											: {}),
										...(currentConversationOwnerId
											? { ownerId: currentConversationOwnerId }
											: {}),
									}}
								/>
								{showAttribution && <StackAttribution />}
							</div>
						</div>
					) : null
				}
			</ChatActionCheck>
		</>
	);
}
