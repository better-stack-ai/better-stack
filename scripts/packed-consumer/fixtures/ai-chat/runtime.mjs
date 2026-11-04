import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { aiChatBackendPlugin } from "@btst/plugin-ai-chat/api";
import { aiChatPermissions } from "@btst/plugin-ai-chat/permissions";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.equal(
	typeof require("@btst/plugin-ai-chat/api").aiChatBackendPlugin,
	"function",
);
assert.equal(
	typeof require("@btst/plugin-ai-chat/query-keys").createAiChatQueryKeys,
	"function",
);
assert.equal(
	typeof require("@btst/plugin-ai-chat/permissions").aiChatPermissions,
	"object",
);

async function verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	aiChatBackendPlugin,
	aiChatPermissions,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [aiChatPermissions],
		rules: ({ aiChat }) => [
			aiChat.conversation.create.when(({ identity }) => identity !== null),
			aiChat.conversation.read.when(
				({ identity, facts }) => identity?.id === facts.ownerId,
			),
			aiChat.conversation.update.when(
				({ identity, facts }) => identity?.id === facts.ownerId,
			),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { aiChat: aiChatBackendPlugin({ model: {} }) },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-owner");
				return id ? { id } : null;
			},
		}),
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-owner": id } });
	const owner = stack.forRequest(request("owner")).operations.aiChat;
	const conversation = await owner.createConversation({
		title: "Packed conversation",
	});
	assert.equal(conversation.title, "Packed conversation");
	assert.equal(conversation.userId, "owner");
	assert.equal(Object.isFrozen(conversation), true);
	assert.equal(
		(await owner.getConversation({ id: conversation.id })).id,
		conversation.id,
	);
	await assert.rejects(
		stack
			.forRequest(request("other"))
			.operations.aiChat.getConversation({ id: conversation.id }),
		{ statusCode: 403 },
	);
	await assert.rejects(
		owner.updateConversation({ id: conversation.id, data: { title: " " } }),
		/Title is required/,
	);
	assert.equal(
		(await owner.getConversation({ id: conversation.id })).title,
		"Packed conversation",
	);
}

await verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	aiChatBackendPlugin,
	aiChatPermissions,
});
await verifyOperations({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-ai-chat/api"),
	...require("@btst/plugin-ai-chat/permissions"),
});
console.log(
	"Packed AI Chat ESM/CJS imports, authorization, validation and existing conversation data passed",
);
