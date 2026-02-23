import type { Adapter } from "@btst/db";
import type { Conversation, ConversationWithMessages, Message } from "../types";

/**
 * Retrieve all conversations, optionally filtered by userId.
 * Pure DB function - no hooks, no HTTP context. Safe for server-side use.
 *
 * @param adapter - The database adapter
 * @param userId - Optional user ID to filter conversations by owner
 */
export async function getAllConversations(
	adapter: Adapter,
	userId?: string,
): Promise<Conversation[]> {
	const whereConditions: Array<{
		field: string;
		value: string;
		operator: "eq";
	}> = [];

	if (userId) {
		whereConditions.push({
			field: "userId",
			value: userId,
			operator: "eq" as const,
		});
	}

	return adapter.findMany<Conversation>({
		model: "conversation",
		where: whereConditions.length > 0 ? whereConditions : undefined,
		sortBy: { field: "updatedAt", direction: "desc" },
	});
}

/**
 * Retrieve a single conversation by its ID, including all messages.
 * Returns null if the conversation is not found.
 * Pure DB function - no hooks, no HTTP context. Safe for server-side use.
 *
 * @param adapter - The database adapter
 * @param id - The conversation ID
 */
export async function getConversationById(
	adapter: Adapter,
	id: string,
): Promise<(Conversation & { messages: Message[] }) | null> {
	const conversations = await adapter.findMany<ConversationWithMessages>({
		model: "conversation",
		where: [{ field: "id", value: id, operator: "eq" as const }],
		limit: 1,
		join: {
			message: true,
		},
	});

	if (!conversations.length) {
		return null;
	}

	const conversation = conversations[0]!;
	const messages = (conversation.message || []).sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);

	const { message: _, ...conversationWithoutJoin } = conversation;
	return {
		...conversationWithoutJoin,
		messages,
	};
}
