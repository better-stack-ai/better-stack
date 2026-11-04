import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	kanbanBackendPlugin,
	KANBAN_QUERY_KEYS,
} from "@btst/plugin-kanban/api";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import { kanbanClientPlugin } from "@btst/plugin-kanban/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.equal(kanbanClientPlugin().id, "kanban");
assert.equal(
	require("@btst/plugin-kanban/client").kanbanClientPlugin().id,
	"kanban",
);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});

async function verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	kanbanBackendPlugin,
	kanbanPermissions,
	KANBAN_QUERY_KEYS,
}) {
	const managesBoard = ({ identity, facts }) => identity?.id === facts.ownerId;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [kanbanPermissions],
		rules: ({ kanban }) => [
			kanban.board.create.when(({ identity }) => identity !== null),
			kanban.board.read.when(managesBoard),
			kanban.column.create.when(managesBoard),
			kanban.task.create.when(managesBoard),
			kanban.task.move.when(managesBoard),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { kanban: kanbanBackendPlugin() },
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
	const owner = stack.forRequest(request("owner")).operations.kanban;
	await stack.adapter.create({
		model: "kanbanBoard",
		forceAllowId: true,
		data: {
			id: "existing-board",
			name: "Existing v5 board",
			slug: "existing-board",
			ownerId: "owner",
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	const existing = await owner.getBoard({ id: "existing-board" });
	assert.equal(existing.name, "Existing v5 board");
	const board = await owner.createBoard({ name: "Packed board" });
	assert.equal(board.ownerId, "owner");
	const source = await owner.createColumn({
		boardId: board.id,
		title: "To do",
	});
	const target = await owner.createColumn({ boardId: board.id, title: "Done" });
	const task = await owner.createTask({
		columnId: source.id,
		title: "Packed task",
	});
	await owner.moveTask({
		taskId: task.id,
		targetColumnId: target.id,
		targetOrder: 0,
	});
	const read = await owner.getBoard({ id: board.id });
	assert.equal(
		read.columns.find((column) => column.id === target.id).tasks[0].id,
		task.id,
	);
	await assert.rejects(
		stack
			.forRequest(request("other"))
			.operations.kanban.getBoard({ id: board.id }),
		{ statusCode: 403 },
	);
	await assert.rejects(
		owner.createTask({ columnId: source.id, title: "" }),
		/Title is required/,
	);
	const queryClient = new QueryClient();
	await stack.raw.kanban.prefetchForRoute("board", queryClient, {
		boardId: board.id,
	});
	const prefetched = queryClient.getQueryData(
		KANBAN_QUERY_KEYS.boardDetail(board.id),
	);
	assert.equal(prefetched.id, board.id);
	assert.equal(typeof prefetched.createdAt, "string");
	assert.equal(
		prefetched.columns.find((column) => column.id === target.id).tasks[0].id,
		task.id,
	);
}

await verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	kanbanBackendPlugin,
	kanbanPermissions,
	KANBAN_QUERY_KEYS,
});
await verifyOperations({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-kanban/api"),
	...require("@btst/plugin-kanban/permissions"),
});
console.log(
	"Packed Kanban ESM/CJS operations, authorization, existing data, task moves and SSG passed",
);
