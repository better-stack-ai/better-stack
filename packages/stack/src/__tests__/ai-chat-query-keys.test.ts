import { describe, expect, it, vi } from "vitest";
import { runResourceMutation } from "../plugins/client";
import {
	aiChatResources,
	createAiChatQueryKeys,
} from "../plugins/ai-chat/query-keys";
import { updateConversationSchema } from "../plugins/ai-chat/schemas";

describe("AI Chat resource declaration", () => {
	it("preserves the v3 conversation query keys", () => {
		const client = vi.fn() as any;
		const queries = createAiChatQueryKeys(client);

		expect([...queries.conversations._def]).toEqual(["conversations"]);
		expect([...queries.conversations.list().queryKey]).toEqual([
			"conversations",
			"list",
			"all",
		]);
		expect([...queries.conversations.detail("conv-1").queryKey]).toEqual([
			"conversations",
			"detail",
			"conv-1",
		]);
	});

	it("forwards headers through list and detail requests", async () => {
		const client = vi
			.fn()
			.mockResolvedValueOnce({ data: [] })
			.mockResolvedValueOnce({ data: null }) as any;
		const headers = { authorization: "Bearer test" };
		const queries = createAiChatQueryKeys(client, headers);

		await queries.conversations.list().queryFn();
		expect(client).toHaveBeenLastCalledWith("/chat/conversations", {
			method: "GET",
			headers,
		});

		await queries.conversations.detail("conv-1").queryFn();
		expect(client).toHaveBeenLastCalledWith("/chat/conversations/:id", {
			method: "GET",
			params: { id: "conv-1" },
			headers,
		});
	});

	it("maps create, rename, and delete mutations and forwards headers", async () => {
		const client = vi
			.fn()
			.mockResolvedValueOnce({ data: { id: "conv-1", title: "New" } })
			.mockResolvedValueOnce({ data: { id: "conv-1", title: "Renamed" } })
			.mockResolvedValueOnce({ data: { success: true } }) as any;
		const headers = { authorization: "Bearer test" };

		await runResourceMutation(
			client,
			aiChatResources.conversations.mutations.create,
			{ id: "conv-1", title: "New" },
			headers,
		);
		expect(client).toHaveBeenLastCalledWith("@post/chat/conversations", {
			method: "POST",
			body: { id: "conv-1", title: "New" },
			headers,
		});

		await runResourceMutation(
			client,
			aiChatResources.conversations.mutations.rename,
			{ id: "conv-1", title: "Renamed" },
			headers,
		);
		expect(client).toHaveBeenLastCalledWith("@put/chat/conversations/:id", {
			method: "PUT",
			params: { id: "conv-1" },
			body: { title: "Renamed" },
			headers,
		});

		await runResourceMutation(
			client,
			aiChatResources.conversations.mutations.delete,
			{ id: "conv-1" },
			headers,
		);
		expect(client).toHaveBeenLastCalledWith("@delete/chat/conversations/:id", {
			method: "DELETE",
			params: { id: "conv-1" },
			headers,
		});
	});

	it("trims rename titles and rejects empty values", () => {
		expect(updateConversationSchema.parse({ title: "  Renamed  " })).toEqual({
			title: "Renamed",
		});
		expect(updateConversationSchema.safeParse({ title: "   " }).success).toBe(
			false,
		);
	});
});
