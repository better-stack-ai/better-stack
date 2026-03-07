import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import {
	streamText,
	convertToModelMessages,
	stepCountIs,
	type LanguageModel,
	type UIMessage,
	type Tool,
} from "ai";
import { aiChatSchema as dbSchema } from "../db";
import {
	chatRequestSchema,
	createConversationSchema,
	updateConversationSchema,
} from "../schemas";
import type { Conversation, ConversationWithMessages, Message } from "../types";
import { getAllConversations, getConversationById } from "./getters";
import {
	BUILT_IN_PAGE_TOOL_ROUTE_ALLOWLIST,
	BUILT_IN_PAGE_TOOL_SCHEMAS,
} from "./page-tools";
import { runHookWithShim } from "../../utils";

/**
 * Context passed to AI Chat API hooks
 */
export interface ChatApiContext<TBody = any, TParams = any, TQuery = any> {
	body?: TBody;
	params?: TParams;
	query?: TQuery;
	request?: Request;
	headers?: Headers;
	[key: string]: any;
}

/**
 * Configuration hooks for AI Chat backend plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface AiChatBackendHooks {
	// ============== Authorization Hooks ==============
	// Throw an error to deny access

	/**
	 * Called before processing a chat message. Throw an error to deny access.
	 * @param messages - Array of messages being sent
	 * @param context - Request context with headers, etc.
	 */
	onBeforeChat?: (
		messages: Array<{ role: string; content: string }>,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called before listing conversations. Throw an error to deny access.
	 * @param context - Request context with headers, etc.
	 */
	onBeforeListConversations?: (context: ChatApiContext) => Promise<void> | void;

	/**
	 * Called before getting a single conversation. Throw an error to deny access.
	 * @param conversationId - ID of the conversation being accessed
	 * @param context - Request context with headers, etc.
	 */
	onBeforeGetConversation?: (
		conversationId: string,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called before creating a conversation. Throw an error to deny access.
	 * @param data - Conversation data being created
	 * @param context - Request context with headers, etc.
	 */
	onBeforeCreateConversation?: (
		data: { id?: string; title?: string },
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called before updating a conversation. Throw an error to deny access.
	 * @param conversationId - ID of the conversation being updated
	 * @param data - Updated conversation data
	 * @param context - Request context with headers, etc.
	 */
	onBeforeUpdateConversation?: (
		conversationId: string,
		data: { title?: string },
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called before deleting a conversation. Throw an error to deny access.
	 * @param conversationId - ID of the conversation being deleted
	 * @param context - Request context with headers, etc.
	 */
	onBeforeDeleteConversation?: (
		conversationId: string,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after the structural routeName/allowlist validation, with the list
	 * of tool names that passed. Return a filtered subset to further restrict
	 * which tools the LLM sees, or return [] to suppress all page tools.
	 * Throw an Error to abort the entire chat request with a 403 response.
	 * Not called when no tools passed the structural validation step.
	 *
	 * @param toolNames - Names that passed the routeName allowlist check
	 * @param routeName - routeName claimed by the request (may be undefined)
	 * @param context   - Full request context (headers, body, etc.)
	 */
	onBeforeToolsActivated?: (
		toolNames: string[],
		routeName: string | undefined,
		context: ChatApiContext,
	) => Promise<string[]> | string[];

	// ============== Lifecycle Hooks ==============

	/**
	 * Called after a chat message is processed successfully
	 * @param conversationId - ID of the conversation
	 * @param messages - Array of messages in the conversation
	 * @param context - Request context
	 */
	onAfterChat?: (
		conversationId: string,
		messages: Message[],
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after conversations are read successfully
	 * @param conversations - Array of conversations that were read
	 * @param context - Request context
	 */
	onConversationsRead?: (
		conversations: Conversation[],
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a single conversation is read successfully
	 * @param conversation - The conversation with messages
	 * @param context - Request context
	 */
	onConversationRead?: (
		conversation: Conversation & { messages: Message[] },
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a conversation is created successfully
	 * @param conversation - The created conversation
	 * @param context - Request context
	 */
	onConversationCreated?: (
		conversation: Conversation,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a conversation is updated successfully
	 * @param conversation - The updated conversation
	 * @param context - Request context
	 */
	onConversationUpdated?: (
		conversation: Conversation,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a conversation is deleted successfully
	 * @param conversationId - ID of the deleted conversation
	 * @param context - Request context
	 */
	onConversationDeleted?: (
		conversationId: string,
		context: ChatApiContext,
	) => Promise<void> | void;

	// ============== Error Hooks ==============

	/**
	 * Called when a chat operation fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onChatError?: (error: Error, context: ChatApiContext) => Promise<void> | void;

	/**
	 * Called when listing conversations fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onListConversationsError?: (
		error: Error,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called when getting a conversation fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onGetConversationError?: (
		error: Error,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called when creating a conversation fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onCreateConversationError?: (
		error: Error,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called when updating a conversation fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onUpdateConversationError?: (
		error: Error,
		context: ChatApiContext,
	) => Promise<void> | void;

	/**
	 * Called when deleting a conversation fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onDeleteConversationError?: (
		error: Error,
		context: ChatApiContext,
	) => Promise<void> | void;
}

/**
 * Plugin mode for AI Chat
 * - 'authenticated': Conversations persisted with userId (default)
 * - 'public': Stateless chat, no persistence (ideal for public chatbots)
 */
export type AiChatMode = "authenticated" | "public";

/**
 * Configuration for AI Chat backend plugin
 */
/**
 * Extracts only the literal (non-index-signature) keys from a type.
 * For `Record<string, T>` this resolves to `never`, so collision checks are
 * skipped when the tools map is typed with a broad string index.
 */
type KnownKeys<T> = {
	[K in keyof T]: string extends K ? never : K;
}[keyof T];

/**
 * Ensures `TClientTools` has no keys that are also literal keys in `TTools`.
 * Colliding keys are mapped to `never`, which produces a compile-time error
 * at the point of the duplicate key. When `TTools` uses a string index
 * signature the check is skipped to avoid false positives.
 */
type NoKeyCollision<
	TTools,
	TClientTools extends Record<string, Tool>,
> = KnownKeys<TTools> & keyof TClientTools extends never
	? TClientTools
	: {
			[K in keyof TClientTools]: K extends KnownKeys<TTools>
				? never // duplicate of a server-side tool — remove from clientToolSchemas
				: TClientTools[K];
		};

export interface AiChatBackendConfig {
	/**
	 * The language model to use for chat completions.
	 * Supports any model from AI SDK providers (OpenAI, Anthropic, Google, etc.)
	 */
	model: LanguageModel;

	/**
	 * Plugin mode:
	 * - 'authenticated': Conversations persisted with userId (requires getUserId)
	 * - 'public': Stateless chat, no persistence (ideal for public chatbots)
	 * @default 'authenticated'
	 */
	mode?: AiChatMode;

	/**
	 * Extract userId from request context (authenticated mode only).
	 * Return null/undefined to deny access in authenticated mode.
	 * This function is called for all conversation operations.
	 * @example (ctx) => ctx.headers?.get('x-user-id')
	 */
	getUserId?: (
		context: ChatApiContext,
	) => string | null | undefined | Promise<string | null | undefined>;

	/**
	 * Optional system prompt to prepend to all conversations
	 */
	systemPrompt?: string;

	/**
	 * Optional tools to make available to the model.
	 * Uses AI SDK v5 tool format.
	 * @see https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
	 */
	tools?: Record<string, Tool>;

	/**
	 * Enable route-aware page tools.
	 * When true, the server will include tool schemas for client-side page tools
	 * (e.g. fillBlogForm, updatePageLayers) based on the availableTools list
	 * sent with each request.
	 * @default false
	 */
	enablePageTools?: boolean;

	/**
	 * Custom client-side tool schemas for non-BTST pages.
	 * Merged with built-in page tool schemas (fillBlogForm, updatePageLayers).
	 * Only included when enablePageTools is true and the tool name appears in
	 * the availableTools list sent with the request.
	 *
	 * @example
	 * clientToolSchemas: {
	 *   addToCart: tool({
	 *     description: "Add current product to cart",
	 *     parameters: z.object({ quantity: z.number().int().min(1) }),
	 *   }),
	 * }
	 */
	clientToolSchemas?: Record<string, Tool>;

	/**
	 * Optional hooks for customizing plugin behavior
	 */
	hooks?: AiChatBackendHooks;
}

/**
 * AI Chat backend plugin
 * Provides API endpoints for AI-powered chat with conversation history
 * Uses AI SDK v5 for model interactions
 *
 * @param config - Configuration including model, tools, and optional hooks
 */
export const aiChatBackendPlugin = <
	TTools extends Record<string, Tool> = Record<never, Tool>,
	TClientTools extends Record<string, Tool> = Record<never, Tool>,
>(
	config: Omit<AiChatBackendConfig, "tools" | "clientToolSchemas"> & {
		tools?: TTools;
		clientToolSchemas?: NoKeyCollision<TTools, TClientTools>;
	},
) =>
	defineBackendPlugin({
		name: "ai-chat",
		// Always include db schema - in public mode we just don't use it
		dbPlugin: dbSchema,

		api: (adapter) => ({
			getAllConversations: (userId?: string) =>
				getAllConversations(adapter, userId),
			getConversationById: (id: string) => getConversationById(adapter, id),
		}),

		routes: (adapter: Adapter) => {
			const mode = config.mode ?? "authenticated";
			const isPublicMode = mode === "public";

			// Helper to extract text content from UIMessage (for conversation titles, etc.)
			const getMessageTextContent = (msg: UIMessage): string => {
				if (msg.parts && Array.isArray(msg.parts)) {
					return msg.parts
						.filter((part: any) => part.type === "text")
						.map((part: any) => part.text)
						.join("");
				}
				return "";
			};

			// Helper to serialize message parts to JSON (preserves all files)
			const serializeMessageParts = (msg: UIMessage): string => {
				if (msg.parts && Array.isArray(msg.parts)) {
					// Filter to only include text and file parts (images, PDFs, text files, etc.)
					const serializableParts = msg.parts.filter(
						(part: any) => part.type === "text" || part.type === "file",
					);
					return JSON.stringify(serializableParts);
				}
				return JSON.stringify([]);
			};

			// Helper to get userId in authenticated mode
			// Returns null if no getUserId is configured, or the userId if available
			// Throws if getUserId returns null/undefined (auth required but not provided)
			const resolveUserId = async (
				context: ChatApiContext,
				throwOnMissing: () => never,
			): Promise<string | null> => {
				if (isPublicMode) {
					return null;
				}
				if (!config.getUserId) {
					// If no getUserId is provided, conversations are not user-scoped
					return null;
				}
				const userId = await config.getUserId(context);
				if (!userId) {
					throwOnMissing();
				}
				return userId;
			};

			// ============== Chat Endpoint ==============
			const chat = createEndpoint(
				"/chat",
				{
					method: "POST",
					body: chatRequestSchema,
				},
				async (ctx) => {
					const {
						messages: rawMessages,
						conversationId,
						pageContext,
						availableTools,
						routeName,
					} = ctx.body;
					const uiMessages = rawMessages as UIMessage[];

					const context: ChatApiContext = {
						body: ctx.body,
						headers: ctx.headers,
						request: ctx.request,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeChat) {
							const messagesForHook = uiMessages.map((msg) => ({
								role: msg.role,
								content: getMessageTextContent(msg),
							}));
							await runHookWithShim(
								() => config.hooks!.onBeforeChat!(messagesForHook, context),
								ctx.error,
								"Unauthorized: Cannot start chat",
							);
						}

						const firstMessage = uiMessages[0];
						if (!firstMessage) {
							throw ctx.error(400, {
								message: "At least one message is required",
							});
						}
						const firstMessageContent = getMessageTextContent(firstMessage);

						// Convert UIMessages to CoreMessages for streamText
						// In AI SDK v6 this became async — await is a no-op for v5's sync return
						const modelMessages = await convertToModelMessages(uiMessages);

						// Build system prompt: base config + optional page context
						const pageContextContent =
							pageContext && pageContext.trim()
								? `\n\nCurrent page context:\n${pageContext}`
								: "";
						const systemContent = config.systemPrompt
							? `${config.systemPrompt}${pageContextContent}`
							: pageContextContent || undefined;

						const messagesWithSystem = systemContent
							? [
									{ role: "system" as const, content: systemContent },
									...modelMessages,
								]
							: modelMessages;

						// Merge page tool schemas when enablePageTools is on.
						// Built-in schemas are only included when the request's routeName is in
						// the tool's allowlist — this prevents a page from claiming tools that
						// are intended for a different route (e.g. requesting updatePageLayers
						// from a blog page). Consumer clientToolSchemas are trusted as-is.
						const activePageTools: Record<string, Tool> =
							config.enablePageTools &&
							availableTools &&
							availableTools.length > 0
								? (() => {
										const consumerSchemas: Record<string, Tool> =
											(config.clientToolSchemas as Record<string, Tool>) ?? {};
										return Object.fromEntries(
											availableTools
												.filter((name) => {
													// Built-in tool: require routeName to be in its allowlist
													if (name in BUILT_IN_PAGE_TOOL_SCHEMAS) {
														const allowed =
															BUILT_IN_PAGE_TOOL_ROUTE_ALLOWLIST[name];
														return (
															allowed &&
															routeName &&
															allowed.includes(routeName)
														);
													}
													// Consumer-defined tool: allow if schema is registered
													return name in consumerSchemas;
												})
												.map((name) => {
													const schema =
														BUILT_IN_PAGE_TOOL_SCHEMAS[name] ??
														consumerSchemas[name]!;
													return [name, schema];
												}),
										);
									})()
								: {};

						// Consumer hook: user-level tool authorization.
						// Runs after the structural routeName allowlist check.
						// A thrown Error is caught and returned as a 403 response,
						// consistent with how onBeforeChat handles return false → 403.
						if (
							config.hooks?.onBeforeToolsActivated &&
							Object.keys(activePageTools).length > 0
						) {
							try {
								const allowed = await config.hooks.onBeforeToolsActivated(
									Object.keys(activePageTools),
									routeName,
									context,
								);
								const allowedSet = new Set(allowed);
								for (const key of Object.keys(activePageTools)) {
									if (!allowedSet.has(key)) {
										delete activePageTools[key];
									}
								}
							} catch (hookError) {
								throw ctx.error(403, {
									message:
										hookError instanceof Error
											? hookError.message
											: "Unauthorized: Tool activation denied",
								});
							}
						}

						// Page tools are layered under server-side tools so that a
						// clientToolSchemas entry with the same name as a tool in
						// config.tools never silently drops its `execute` function.
						// Server-side tools always win on collision.
						const mergedTools =
							Object.keys(activePageTools).length > 0
								? { ...activePageTools, ...config.tools }
								: config.tools;

						// PUBLIC MODE: Stream without persistence
						if (isPublicMode) {
							const result = streamText({
								model: config.model,
								messages: messagesWithSystem,
								tools: mergedTools,
								// Enable multi-step tool calls if tools are configured
								...(mergedTools ? { stopWhen: stepCountIs(5) } : {}),
							});

							return result.toUIMessageStreamResponse({
								originalMessages: uiMessages,
							});
						}

						// AUTHENTICATED MODE: Persist conversations
						// Get userId if getUserId is configured
						let userId: string | null = null;
						if (config.getUserId) {
							const resolvedUserId = await config.getUserId(context);
							if (!resolvedUserId) {
								throw ctx.error(403, {
									message: "Unauthorized: User authentication required",
								});
							}
							userId = resolvedUserId;
						}

						let convId = conversationId;

						// Create or verify conversation
						if (!convId) {
							const newConv = await adapter.create<Conversation>({
								model: "conversation",
								data: {
									...(userId ? { userId } : {}),
									title: firstMessageContent.slice(0, 50) || "New Conversation",
									createdAt: new Date(),
									updatedAt: new Date(),
								},
							});
							convId = newConv.id;
						} else {
							const existing = await adapter.findMany<Conversation>({
								model: "conversation",
								where: [{ field: "id", value: convId, operator: "eq" }],
								limit: 1,
							});
							if (!existing.length) {
								const newConv = await adapter.create<Conversation>({
									model: "conversation",
									data: {
										id: convId,
										...(userId ? { userId } : {}),
										title:
											firstMessageContent.slice(0, 50) || "New Conversation",
										createdAt: new Date(),
										updatedAt: new Date(),
									} as Conversation,
								});
								convId = newConv.id;
							} else {
								// Verify ownership if userId is set
								const conv = existing[0]!;
								if (userId && conv.userId && conv.userId !== userId) {
									throw ctx.error(403, {
										message: "Unauthorized: Cannot access this conversation",
									});
								}
							}
						}

						// Sync database messages with client state
						// The client sends all messages for the conversation
						// We need to ensure the DB matches this state before adding the assistant response
						const existingMessages = await adapter.findMany<Message>({
							model: "message",
							where: [
								{
									field: "conversationId",
									value: convId as string,
									operator: "eq",
								},
							],
							sortBy: { field: "createdAt", direction: "asc" },
						});

						const lastIncomingMessage = uiMessages[uiMessages.length - 1];
						const isNewUserMessage = lastIncomingMessage?.role === "user";

						// Determine the expected DB count before we add new messages:
						// - If last incoming is a user message: it might be new or existing
						// - Compare with what's in DB to determine if it's a new message or regenerate
						let expectedDbCount: number;
						let shouldAddUserMessage = false;

						if (isNewUserMessage) {
							// Check if this user message already exists in DB
							// by comparing the last user message in each
							const lastDbUserMessage = [...existingMessages]
								.reverse()
								.find((m) => m.role === "user");
							const incomingUserContent =
								serializeMessageParts(lastIncomingMessage);

							if (
								lastDbUserMessage &&
								lastDbUserMessage.content === incomingUserContent
							) {
								// The user message already exists - this is a regenerate
								// DB should have all incoming messages (no new user message to add)
								expectedDbCount = uiMessages.length;
								shouldAddUserMessage = false;
							} else {
								// New user message - DB should have incoming count - 1
								expectedDbCount = uiMessages.length - 1;
								shouldAddUserMessage = true;
							}
						} else {
							// Last message is not user (unusual case)
							expectedDbCount = uiMessages.length;
							shouldAddUserMessage = false;
						}

						// If DB has more messages than expected, delete the excess
						// This handles both edit (truncated history) and retry (regenerating last response)
						// Use a transaction to ensure atomicity - if create fails, deletions are rolled back
						const actualDbCount = existingMessages.length;
						const messagesToDelete =
							actualDbCount > expectedDbCount
								? existingMessages.slice(expectedDbCount)
								: [];

						// Wrap deletion and creation in a transaction for atomicity
						// This prevents data loss if the create operation fails after deletions
						await adapter.transaction(async (tx) => {
							// Delete excess messages
							for (const msg of messagesToDelete) {
								await tx.delete({
									model: "message",
									where: [{ field: "id", value: msg.id }],
								});
							}

							// Save user message if it's new
							if (shouldAddUserMessage && lastIncomingMessage) {
								await tx.create<Message>({
									model: "message",
									data: {
										conversationId: convId as string,
										role: "user",
										content: serializeMessageParts(lastIncomingMessage),
										createdAt: new Date(),
									},
								});
							}
						});

						const result = streamText({
							model: config.model,
							messages: messagesWithSystem,
							tools: mergedTools,
							// Enable multi-step tool calls if tools are configured
							...(mergedTools ? { stopWhen: stepCountIs(5) } : {}),
							onFinish: async (completion: { text: string }) => {
								// Wrap in try-catch since this runs after the response is sent
								// and errors would otherwise become unhandled promise rejections
								try {
									// Save assistant message (serialize as parts for consistency)
									const assistantParts = completion.text
										? [{ type: "text", text: completion.text }]
										: [];
									await adapter.create<Message>({
										model: "message",
										data: {
											conversationId: convId as string,
											role: "assistant",
											content: JSON.stringify(assistantParts),
											createdAt: new Date(),
										},
									});

									// Update conversation timestamp
									await adapter.update({
										model: "conversation",
										where: [{ field: "id", value: convId as string }],
										update: { updatedAt: new Date() },
									});

									// Lifecycle hook
									if (config.hooks?.onAfterChat) {
										const messages = await adapter.findMany<Message>({
											model: "message",
											where: [
												{
													field: "conversationId",
													value: convId as string,
													operator: "eq",
												},
											],
											sortBy: { field: "createdAt", direction: "asc" },
										});
										await config.hooks.onAfterChat(
											convId as string,
											messages,
											context,
										);
									}
								} catch (error) {
									// Log the error since the response is already sent
									console.error("[ai-chat] Error in onFinish callback:", error);
									// Call error hook if configured
									if (config.hooks?.onChatError) {
										try {
											await config.hooks.onChatError(error as Error, context);
										} catch (hookError) {
											console.error(
												"[ai-chat] Error in onChatError hook:",
												hookError,
											);
										}
									}
								}
							},
						});

						// Return the stream response with conversation ID header
						// This allows the client to know which conversation was created/used
						const response = result.toUIMessageStreamResponse({
							originalMessages: uiMessages,
						});

						// Add the conversation ID header to the response
						const headers = new Headers(response.headers);
						headers.set("X-Conversation-Id", convId as string);

						return new Response(response.body, {
							status: response.status,
							statusText: response.statusText,
							headers,
						});
					} catch (error) {
						if (config.hooks?.onChatError) {
							await config.hooks.onChatError(error as Error, context);
						}
						throw error;
					}
				},
			);

			// ============== Create Conversation ==============
			const createConversation = createEndpoint(
				"/chat/conversations",
				{
					method: "POST",
					body: createConversationSchema,
				},
				async (ctx) => {
					// Public mode: conversations are not persisted
					if (isPublicMode) {
						throw ctx.error(404, {
							message: "Conversations not available in public mode",
						});
					}

					const { id, title } = ctx.body;
					const context: ChatApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						// Get userId if configured
						const userId = await resolveUserId(context, () => {
							throw ctx.error(403, {
								message: "Unauthorized: User authentication required",
							});
						});

						// Authorization hook
						if (config.hooks?.onBeforeCreateConversation) {
							await runHookWithShim(
								() =>
									config.hooks!.onBeforeCreateConversation!(
										{ id, title },
										context,
									),
								ctx.error,
								"Unauthorized: Cannot create conversation",
							);
						}

						const newConv = await adapter.create<Conversation>({
							model: "conversation",
							data: {
								...(id ? { id } : {}),
								...(userId ? { userId } : {}),
								title: title || "New Conversation",
								createdAt: new Date(),
								updatedAt: new Date(),
							} as Conversation,
						});

						// Lifecycle hook
						if (config.hooks?.onConversationCreated) {
							await config.hooks.onConversationCreated(newConv, context);
						}

						return newConv;
					} catch (error) {
						if (config.hooks?.onCreateConversationError) {
							await config.hooks.onCreateConversationError(
								error as Error,
								context,
							);
						}
						throw error;
					}
				},
			);

			// ============== List Conversations ==============
			const listConversations = createEndpoint(
				"/chat/conversations",
				{
					method: "GET",
				},
				async (ctx) => {
					// Public mode: return empty list
					if (isPublicMode) {
						return [];
					}

					const context: ChatApiContext = {
						headers: ctx.headers,
					};

					try {
						// Get userId if configured
						const userId = await resolveUserId(context, () => {
							throw ctx.error(403, {
								message: "Unauthorized: User authentication required",
							});
						});

						// Authorization hook
						if (config.hooks?.onBeforeListConversations) {
							await runHookWithShim(
								() => config.hooks!.onBeforeListConversations!(context),
								ctx.error,
								"Unauthorized: Cannot list conversations",
							);
						}

						// Build where conditions - filter by userId if set
						const whereConditions: Array<{
							field: string;
							value: string;
							operator: "eq";
						}> = [];
						if (userId) {
							whereConditions.push({
								field: "userId",
								value: userId,
								operator: "eq",
							});
						}

						const conversations = await adapter.findMany<Conversation>({
							model: "conversation",
							where: whereConditions.length > 0 ? whereConditions : undefined,
							sortBy: { field: "updatedAt", direction: "desc" },
						});

						// Lifecycle hook
						if (config.hooks?.onConversationsRead) {
							await config.hooks.onConversationsRead(conversations, context);
						}

						return conversations;
					} catch (error) {
						if (config.hooks?.onListConversationsError) {
							await config.hooks.onListConversationsError(
								error as Error,
								context,
							);
						}
						throw error;
					}
				},
			);

			// ============== Get Conversation ==============
			const getConversation = createEndpoint(
				"/chat/conversations/:id",
				{
					method: "GET",
				},
				async (ctx) => {
					// Public mode: conversations are not persisted
					if (isPublicMode) {
						throw ctx.error(404, {
							message: "Conversations not available in public mode",
						});
					}

					const { id } = ctx.params;
					const context: ChatApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Get userId if configured
						const userId = await resolveUserId(context, () => {
							throw ctx.error(403, {
								message: "Unauthorized: User authentication required",
							});
						});

						// Authorization hook
						if (config.hooks?.onBeforeGetConversation) {
							await runHookWithShim(
								() => config.hooks!.onBeforeGetConversation!(id, context),
								ctx.error,
								"Unauthorized: Cannot get conversation",
							);
						}

						// Fetch conversation with messages in a single query using join
						const conversations =
							await adapter.findMany<ConversationWithMessages>({
								model: "conversation",
								where: [{ field: "id", value: id, operator: "eq" }],
								limit: 1,
								join: {
									message: true,
								},
							});

						if (!conversations.length) {
							throw ctx.error(404, { message: "Conversation not found" });
						}

						const conversation = conversations[0]!;

						// Verify ownership if userId is set
						if (
							userId &&
							conversation.userId &&
							conversation.userId !== userId
						) {
							throw ctx.error(403, {
								message: "Unauthorized: Cannot access this conversation",
							});
						}

						// Sort messages by createdAt and map to result format
						const messages = (conversation.message || []).sort(
							(a, b) =>
								new Date(a.createdAt).getTime() -
								new Date(b.createdAt).getTime(),
						);

						const { message: _, ...conversationWithoutJoin } = conversation;
						const result = {
							...conversationWithoutJoin,
							messages,
						} as Conversation & { messages: Message[] };

						// Lifecycle hook
						if (config.hooks?.onConversationRead) {
							await config.hooks.onConversationRead(result, context);
						}

						return result;
					} catch (error) {
						if (config.hooks?.onGetConversationError) {
							await config.hooks.onGetConversationError(
								error as Error,
								context,
							);
						}
						throw error;
					}
				},
			);

			// ============== Update Conversation ==============
			const updateConversation = createEndpoint(
				"/chat/conversations/:id",
				{
					method: "PUT",
					body: updateConversationSchema,
				},
				async (ctx) => {
					// Public mode: conversations are not persisted
					if (isPublicMode) {
						throw ctx.error(404, {
							message: "Conversations not available in public mode",
						});
					}

					const { id } = ctx.params;
					const { title } = ctx.body;
					const context: ChatApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						// Get userId if configured
						const userId = await resolveUserId(context, () => {
							throw ctx.error(403, {
								message: "Unauthorized: User authentication required",
							});
						});

						// Check ownership before update
						const existing = await adapter.findMany<Conversation>({
							model: "conversation",
							where: [{ field: "id", value: id, operator: "eq" }],
							limit: 1,
						});

						if (!existing.length) {
							throw ctx.error(404, { message: "Conversation not found" });
						}

						const conversation = existing[0]!;
						if (
							userId &&
							conversation.userId &&
							conversation.userId !== userId
						) {
							throw ctx.error(403, {
								message: "Unauthorized: Cannot update this conversation",
							});
						}

						// Authorization hook
						if (config.hooks?.onBeforeUpdateConversation) {
							await runHookWithShim(
								() =>
									config.hooks!.onBeforeUpdateConversation!(
										id,
										{ title },
										context,
									),
								ctx.error,
								"Unauthorized: Cannot update conversation",
							);
						}

						const updated = await adapter.update<Conversation>({
							model: "conversation",
							where: [{ field: "id", value: id }],
							update: {
								...(title !== undefined ? { title } : {}),
								updatedAt: new Date(),
							},
						});

						if (!updated) {
							throw ctx.error(404, { message: "Conversation not found" });
						}

						// Lifecycle hook
						if (config.hooks?.onConversationUpdated) {
							await config.hooks.onConversationUpdated(updated, context);
						}

						return updated;
					} catch (error) {
						if (config.hooks?.onUpdateConversationError) {
							await config.hooks.onUpdateConversationError(
								error as Error,
								context,
							);
						}
						throw error;
					}
				},
			);

			// ============== Delete Conversation ==============
			const deleteConversation = createEndpoint(
				"/chat/conversations/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					// Public mode: conversations are not persisted
					if (isPublicMode) {
						throw ctx.error(404, {
							message: "Conversations not available in public mode",
						});
					}

					const { id } = ctx.params;
					const context: ChatApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Get userId if configured
						const userId = await resolveUserId(context, () => {
							throw ctx.error(403, {
								message: "Unauthorized: User authentication required",
							});
						});

						// Check ownership before delete
						const existing = await adapter.findMany<Conversation>({
							model: "conversation",
							where: [{ field: "id", value: id, operator: "eq" }],
							limit: 1,
						});

						if (!existing.length) {
							throw ctx.error(404, { message: "Conversation not found" });
						}

						const conversation = existing[0]!;
						if (
							userId &&
							conversation.userId &&
							conversation.userId !== userId
						) {
							throw ctx.error(403, {
								message: "Unauthorized: Cannot delete this conversation",
							});
						}

						// Authorization hook
						if (config.hooks?.onBeforeDeleteConversation) {
							await runHookWithShim(
								() => config.hooks!.onBeforeDeleteConversation!(id, context),
								ctx.error,
								"Unauthorized: Cannot delete conversation",
							);
						}

						// Messages are automatically deleted via cascade (onDelete: "cascade")
						await adapter.delete({
							model: "conversation",
							where: [{ field: "id", value: id }],
						});

						// Lifecycle hook
						if (config.hooks?.onConversationDeleted) {
							await config.hooks.onConversationDeleted(id, context);
						}

						return { success: true };
					} catch (error) {
						if (config.hooks?.onDeleteConversationError) {
							await config.hooks.onDeleteConversationError(
								error as Error,
								context,
							);
						}
						throw error;
					}
				},
			);

			return {
				chat,
				createConversation,
				listConversations,
				getConversation,
				updateConversation,
				deleteConversation,
			};
		},
	});

export type AiChatApiRouter = ReturnType<
	ReturnType<typeof aiChatBackendPlugin>["routes"]
>;
