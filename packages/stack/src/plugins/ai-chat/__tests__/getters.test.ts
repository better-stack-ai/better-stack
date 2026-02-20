import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { Adapter } from "@btst/db";
import { aiChatSchema } from "../db";
import { getAllConversations, getConversationById } from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(aiChatSchema);
	return createMemoryAdapter(db)({});
};

async function createConversation(
	adapter: Adapter,
	title: string,
	userId?: string,
): Promise<any> {
	return adapter.create({
		model: "conversation",
		data: {
			title,
			...(userId ? { userId } : {}),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

describe("ai-chat getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	describe("getAllConversations", () => {
		it("returns empty array when no conversations exist", async () => {
			const convs = await getAllConversations(adapter);
			expect(convs).toEqual([]);
		});

		it("returns all conversations sorted by updatedAt desc", async () => {
			await createConversation(adapter, "First");
			await createConversation(adapter, "Second");

			const convs = await getAllConversations(adapter);
			expect(convs).toHaveLength(2);
		});

		it("filters conversations by userId", async () => {
			await createConversation(adapter, "Alice Conv", "user-alice");
			await createConversation(adapter, "Bob Conv", "user-bob");
			await createConversation(adapter, "No User Conv");

			const aliceConvs = await getAllConversations(adapter, "user-alice");
			expect(aliceConvs).toHaveLength(1);
			expect(aliceConvs[0]!.title).toBe("Alice Conv");

			const allConvs = await getAllConversations(adapter);
			expect(allConvs).toHaveLength(3);
		});
	});

	describe("getConversationById", () => {
		it("returns null when conversation does not exist", async () => {
			const conv = await getConversationById(adapter, "nonexistent");
			expect(conv).toBeNull();
		});

		it("returns conversation with messages", async () => {
			const conv = (await createConversation(adapter, "My Chat")) as any;

			await adapter.create({
				model: "message",
				data: {
					conversationId: conv.id,
					role: "user",
					content: JSON.stringify([{ type: "text", text: "Hello!" }]),
					createdAt: new Date(Date.now() - 1000),
				},
			});
			await adapter.create({
				model: "message",
				data: {
					conversationId: conv.id,
					role: "assistant",
					content: JSON.stringify([{ type: "text", text: "Hi there!" }]),
					createdAt: new Date(),
				},
			});

			const result = await getConversationById(adapter, conv.id);
			expect(result).not.toBeNull();
			expect(result!.id).toBe(conv.id);
			expect(result!.title).toBe("My Chat");
			expect(result!.messages).toHaveLength(2);
			expect(result!.messages[0]!.role).toBe("user");
			expect(result!.messages[1]!.role).toBe("assistant");
		});

		it("returns conversation with empty messages array if none exist", async () => {
			const conv = (await createConversation(adapter, "Empty Chat")) as any;

			const result = await getConversationById(adapter, conv.id);
			expect(result).not.toBeNull();
			expect(result!.messages).toEqual([]);
		});
	});
});
