import { describe, expect, it, vi } from "vitest";
import { runResourceMutation } from "../plugins/client";
import {
	aiChatIdentityKey,
	aiChatResources,
	createAiChatQueryKeys,
} from "../plugins/ai-chat/query-keys";
import { updateConversationSchema } from "../plugins/ai-chat/schemas";

describe("AI Chat resource declaration", () => {
	it("partitions protected conversation keys without changing legacy keys", () => {
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
		const identity = { id: "user-1", role: "admin" };
		const identityKey = aiChatIdentityKey(identity);
		expect([...queries.conversations.list(identity).queryKey]).toEqual([
			"conversations",
			"list",
			"all",
			{ identity: identityKey },
		]);
		expect([
			...queries.conversations.detail("conv-1", identity).queryKey,
		]).toEqual([
			"conversations",
			"detail",
			"conv-1",
			{ identity: identityKey },
		]);
		expect(queries.conversations.list(identity).queryKey).not.toEqual(
			queries.conversations.list({ ...identity, role: "user" }).queryKey,
		);
		const circular = { id: "user-1", role: "admin" } as Record<
			string,
			unknown
		> & { id: string };
		circular.self = circular;
		expect(() => queries.conversations.list(circular).queryKey).not.toThrow();
		expect(
			JSON.stringify(queries.conversations.list(circular).queryKey),
		).not.toContain("role");
		expect(
			queries.conversations.list({
				id: "user-1",
				roles: new Set(["admin"]),
			}).queryKey,
		).not.toEqual(
			queries.conversations.list({
				id: "user-1",
				roles: new Set(["viewer"]),
			}).queryKey,
		);
		class LegacyClaims {
			role = "admin";
			check = () => true;
		}
		const legacyIdentity = {
			id: "legacy-user",
			claims: new LegacyClaims(),
			marker: Symbol("legacy"),
		};
		expect(
			() => queries.conversations.list(legacyIdentity).queryKey,
		).not.toThrow();
		expect(
			JSON.stringify(queries.conversations.list(legacyIdentity).queryKey),
		).not.toContain("admin");
		expect(
			queries.conversations.list({
				id: "legacy-user",
				check: function sameName() {
					return true;
				},
			}).queryKey,
		).not.toEqual(
			queries.conversations.list({
				id: "legacy-user",
				check: function sameName() {
					return true;
				},
			}).queryKey,
		);
		expect(
			queries.conversations.list({
				id: "legacy-user",
				claim: new ArrayBuffer(1),
			}).queryKey,
		).not.toEqual(
			queries.conversations.list({
				id: "legacy-user",
				claim: new Uint8Array([0]),
			}).queryKey,
		);
		expect(
			queries.conversations.list({ id: "legacy-user", claims: [] }).queryKey,
		).not.toEqual(
			queries.conversations.list({
				id: "legacy-user",
				claims: new Array(1),
			}).queryKey,
		);
		const firstSymbol = Symbol("same-description");
		const secondSymbol = Symbol("same-description");
		expect(
			queries.conversations.list({
				id: "legacy-user",
				claim: firstSymbol,
			}).queryKey,
		).not.toEqual(
			queries.conversations.list({
				id: "legacy-user",
				claim: secondSymbol,
			}).queryKey,
		);
		expect([...queries.conversations.list("anonymous").queryKey]).toEqual([
			"conversations",
			"list",
			"all",
			{ identity: "anonymous" },
		]);
	});

	it("does not request history while identity resolution is pending or failed", async () => {
		const client = vi.fn() as any;
		const queries = createAiChatQueryKeys(client);
		await expect(
			queries.conversations.list("pending:7").queryFn(),
		).resolves.toBeNull();
		await expect(
			queries.conversations.detail("conv-1", "error:7").queryFn(),
		).resolves.toBeNull();
		expect(client).not.toHaveBeenCalled();
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

	it("does not broadly refresh protected caches after mutations", () => {
		expect(aiChatResources.conversations.mutations.create.refresh).toBe(false);
		expect(aiChatResources.conversations.mutations.rename.refresh).toBe(false);
		expect(aiChatResources.conversations.mutations.delete.refresh).toBe(false);
	});
});
