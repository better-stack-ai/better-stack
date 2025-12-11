import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import {
	streamText,
	convertToModelMessages,
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
import type { Conversation, Message } from "../types";

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
	// Return false to deny access

	/**
	 * Called before processing a chat message. Return false to deny access.
	 * @param messages - Array of messages being sent
	 * @param context - Request context with headers, etc.
	 */
	onBeforeChat?: (
		messages: Array<{ role: string; content: string }>,
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before listing conversations. Return false to deny access.
	 * @param context - Request context with headers, etc.
	 */
	onBeforeListConversations?: (
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before getting a single conversation. Return false to deny access.
	 * @param conversationId - ID of the conversation being accessed
	 * @param context - Request context with headers, etc.
	 */
	onBeforeGetConversation?: (
		conversationId: string,
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before creating a conversation. Return false to deny access.
	 * @param data - Conversation data being created
	 * @param context - Request context with headers, etc.
	 */
	onBeforeCreateConversation?: (
		data: { id?: string; title?: string },
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before updating a conversation. Return false to deny access.
	 * @param conversationId - ID of the conversation being updated
	 * @param data - Updated conversation data
	 * @param context - Request context with headers, etc.
	 */
	onBeforeUpdateConversation?: (
		conversationId: string,
		data: { title?: string },
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called before deleting a conversation. Return false to deny access.
	 * @param conversationId - ID of the conversation being deleted
	 * @param context - Request context with headers, etc.
	 */
	onBeforeDeleteConversation?: (
		conversationId: string,
		context: ChatApiContext,
	) => Promise<boolean> | boolean;

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
 * Configuration for AI Chat backend plugin
 */
export interface AiChatBackendConfig {
	/**
	 * The language model to use for chat completions.
	 * Supports any model from AI SDK providers (OpenAI, Anthropic, Google, etc.)
	 */
	model: LanguageModel;

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
export const aiChatBackendPlugin = (config: AiChatBackendConfig) =>
	defineBackendPlugin({
		name: "ai-chat",
		dbPlugin: dbSchema,
		routes: (adapter: Adapter) => {
			// Helper to extract text content from UIMessage
			const getMessageContent = (msg: UIMessage): string => {
				if (msg.parts && Array.isArray(msg.parts)) {
					return msg.parts
						.filter((part: any) => part.type === "text")
						.map((part: any) => part.text)
						.join("");
				}
				return "";
			};

			// ============== Chat Endpoint ==============
			const chat = createEndpoint(
				"/chat",
				{
					method: "POST",
					body: chatRequestSchema,
				},
				async (ctx) => {
					const { messages: rawMessages, conversationId } = ctx.body;
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
								content: getMessageContent(msg),
							}));
							const canChat = await config.hooks.onBeforeChat(
								messagesForHook,
								context,
							);
							if (!canChat) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot start chat",
								});
							}
						}

						let convId = conversationId;
						const firstMessage = uiMessages[0];
						if (!firstMessage) {
							throw ctx.error(400, {
								message: "At least one message is required",
							});
						}
						const firstMessageContent = getMessageContent(firstMessage);

						// Create or verify conversation
						if (!convId) {
							const newConv = await adapter.create<Conversation>({
								model: "conversation",
								data: {
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
										title:
											firstMessageContent.slice(0, 50) || "New Conversation",
										createdAt: new Date(),
										updatedAt: new Date(),
									} as Conversation,
								});
								convId = newConv.id;
							}
						}

						// Save user message
						const lastMessage = uiMessages[uiMessages.length - 1];
						if (lastMessage && lastMessage.role === "user") {
							await adapter.create<Message>({
								model: "message",
								data: {
									conversationId: convId as string,
									role: "user",
									content: getMessageContent(lastMessage),
									createdAt: new Date(),
								},
							});
						}

						// Convert UIMessages to CoreMessages for streamText
						const modelMessages = convertToModelMessages(uiMessages);

						// Add system prompt if configured
						const messagesWithSystem = config.systemPrompt
							? [
									{ role: "system" as const, content: config.systemPrompt },
									...modelMessages,
								]
							: modelMessages;

						const result = streamText({
							model: config.model,
							messages: messagesWithSystem,
							tools: config.tools,
							onFinish: async (completion: { text: string }) => {
								// Save assistant message
								await adapter.create<Message>({
									model: "message",
									data: {
										conversationId: convId as string,
										role: "assistant",
										content: completion.text,
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
							},
						});

						return result.toUIMessageStreamResponse({
							originalMessages: uiMessages,
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
				"/conversations",
				{
					method: "POST",
					body: createConversationSchema,
				},
				async (ctx) => {
					const { id, title } = ctx.body;
					const context: ChatApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeCreateConversation) {
							const canCreate = await config.hooks.onBeforeCreateConversation(
								{ id, title },
								context,
							);
							if (!canCreate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot create conversation",
								});
							}
						}

						const newConv = await adapter.create<Conversation>({
							model: "conversation",
							data: {
								...(id ? { id } : {}),
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
				"/conversations",
				{
					method: "GET",
				},
				async (ctx) => {
					const context: ChatApiContext = {
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeListConversations) {
							const canList =
								await config.hooks.onBeforeListConversations(context);
							if (!canList) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot list conversations",
								});
							}
						}

						const conversations = await adapter.findMany<Conversation>({
							model: "conversation",
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
				"/conversations/:id",
				{
					method: "GET",
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context: ChatApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeGetConversation) {
							const canGet = await config.hooks.onBeforeGetConversation(
								id,
								context,
							);
							if (!canGet) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot get conversation",
								});
							}
						}

						const conversations = await adapter.findMany<Conversation>({
							model: "conversation",
							where: [{ field: "id", value: id, operator: "eq" }],
							limit: 1,
						});

						if (!conversations.length) {
							throw ctx.error(404, { message: "Conversation not found" });
						}

						const messages = await adapter.findMany<Message>({
							model: "message",
							where: [{ field: "conversationId", value: id, operator: "eq" }],
							sortBy: { field: "createdAt", direction: "asc" },
						});

						const result = {
							...conversations[0]!,
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
				"/conversations/:id",
				{
					method: "PUT",
					body: updateConversationSchema,
				},
				async (ctx) => {
					const { id } = ctx.params;
					const { title } = ctx.body;
					const context: ChatApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeUpdateConversation) {
							const canUpdate = await config.hooks.onBeforeUpdateConversation(
								id,
								{ title },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot update conversation",
								});
							}
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
				"/conversations/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context: ChatApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (config.hooks?.onBeforeDeleteConversation) {
							const canDelete = await config.hooks.onBeforeDeleteConversation(
								id,
								context,
							);
							if (!canDelete) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot delete conversation",
								});
							}
						}

						await adapter.transaction(async (tx) => {
							await tx.delete({
								model: "message",
								where: [{ field: "conversationId", value: id }],
							});
							await tx.delete({
								model: "conversation",
								where: [{ field: "id", value: id }],
							});
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
