import type {
	Conversation,
	Message,
	SerializedConversation,
	SerializedMessage,
} from "../types";

/** Serialize a conversation for HTTP and immutable operation consumers. */
export function serializeConversation(
	conversation: Conversation,
): SerializedConversation {
	return {
		id: conversation.id,
		...(conversation.userId ? { userId: conversation.userId } : {}),
		title: conversation.title,
		createdAt: conversation.createdAt.toISOString(),
		updatedAt: conversation.updatedAt.toISOString(),
	};
}

/** Serialize one persisted chat message. */
export function serializeMessage(message: Message): SerializedMessage {
	return {
		id: message.id,
		conversationId: message.conversationId,
		role: message.role,
		content: message.content,
		createdAt: message.createdAt.toISOString(),
	};
}
