import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import {
	streamText,
	convertToModelMessages,
	type LanguageModel,
	type UIMessage,
} from "ai";
import { aiChatSchema as dbSchema } from "../db";
import { chatRequestSchema, createConversationSchema } from "../schemas";
import type { Conversation, Message } from "../types";

export interface ChatApiContext {
	body?: any;
	params?: any;
	query?: any;
	request?: Request;
	headers?: Headers;
	[key: string]: any;
}

export interface AiChatBackendHooks {
	onBeforeChat?: (
		messages: any[],
		context: ChatApiContext,
	) => Promise<boolean> | boolean;
	onAfterChat?: (
		conversationId: string,
		messages: Message[],
		context: ChatApiContext,
	) => Promise<void> | void;
}

export interface AiChatBackendConfig {
	model: LanguageModel;
	hooks?: AiChatBackendHooks;
}

export const aiChatBackendPlugin = (config: AiChatBackendConfig) =>
	defineBackendPlugin({
		name: "ai-chat",
		dbPlugin: dbSchema,
		routes: (adapter: Adapter) => {
			const chat = createEndpoint(
				"/chat",
				{
					method: "POST",
					body: chatRequestSchema,
				},
				async (ctx) => {
					const { messages: rawMessages, conversationId } = ctx.body;

					// Convert UIMessages to the format expected by the schema
					// The messages come as UIMessage[] with parts, we need to handle them properly
					const uiMessages = rawMessages as UIMessage[];

					// Extract content for database operations (get first text part)
					const getMessageContent = (msg: UIMessage): string => {
						if (msg.parts && Array.isArray(msg.parts)) {
							return msg.parts
								.filter((part: any) => part.type === "text")
								.map((part: any) => part.text)
								.join("");
						}
						return "";
					};

					const context: ChatApiContext = {
						body: ctx.body,
						headers: ctx.headers,
						request: ctx.request,
					};

					if (config.hooks?.onBeforeChat) {
						// Convert to content format for hooks
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
						// Verify conversation exists
						const existing = await adapter.findMany<Conversation>({
							model: "conversation",
							where: [{ field: "id", value: convId, operator: "eq" }],
							limit: 1,
						});
						if (!existing.length) {
							// Cast to any to allow passing ID if the adapter supports it
							const newConv = await adapter.create<Conversation>({
								model: "conversation",
								data: {
									id: convId,
									title: firstMessageContent.slice(0, 50) || "New Conversation",
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
					// See: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot
					const modelMessages = convertToModelMessages(uiMessages);

					const result = streamText({
						model: config.model,
						messages: modelMessages,
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
						},
					});

					// Return the stream response directly
					// Note: originalMessages prevents duplicate messages in the stream
					return result.toUIMessageStreamResponse({
						originalMessages: uiMessages,
					});
				},
			);

			const createConversation = createEndpoint(
				"/conversations",
				{
					method: "POST",
					body: createConversationSchema,
				},
				async (ctx) => {
					const { id, title } = ctx.body;
					const newConv = await adapter.create<Conversation>({
						model: "conversation",
						data: {
							...(id ? { id } : {}),
							title: title || "New Conversation",
							createdAt: new Date(),
							updatedAt: new Date(),
						} as Conversation,
					});
					return newConv;
				},
			);

			const listConversations = createEndpoint(
				"/conversations",
				{
					method: "GET",
				},
				async () => {
					const conversations = await adapter.findMany<Conversation>({
						model: "conversation",
						sortBy: { field: "updatedAt", direction: "desc" },
					});
					return conversations;
				},
			);

			const getConversation = createEndpoint(
				"/conversations/:id",
				{
					method: "GET",
				},
				async (ctx) => {
					const { id } = ctx.params;
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

					return {
						...conversations[0],
						messages,
					};
				},
			);

			const deleteConversation = createEndpoint(
				"/conversations/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const { id } = ctx.params;

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

					return { success: true };
				},
			);

			return {
				chat,
				createConversation,
				listConversations,
				getConversation,
				deleteConversation,
			};
		},
	});

export type AiChatApiRouter = ReturnType<
	ReturnType<typeof aiChatBackendPlugin>["routes"]
>;
