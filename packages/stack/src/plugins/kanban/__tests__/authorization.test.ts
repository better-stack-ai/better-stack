import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DatabaseDefinition, type DBAdapter, defineDb } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import {
	createServerAuth,
	type ServerAuth,
} from "../../../authorization/server";
import { KANBAN_QUERY_KEYS, kanbanBackendPlugin } from "../api";
import { kanbanPermissions } from "../permissions";
import type { Board, Column, KanbanBackendHooks, Task } from "../types";

const rawMemoryAdapter = (db: DatabaseDefinition) =>
	createMemoryAdapter(db)({});

describe("Kanban authorization inventory", () => {
	it("covers every maintained HTTP and programmatic operation with a stable descriptor", () => {
		const plugin = kanbanBackendPlugin();
		const adapter = createMemoryAdapter(defineDb({}).use(plugin.dbPlugin))({});
		const operations = plugin.operations?.(adapter);

		expect(Object.keys(operations ?? {}).sort()).toEqual([
			"createBoard",
			"createColumn",
			"createTask",
			"deleteBoard",
			"deleteColumn",
			"deleteTask",
			"getBoard",
			"listBoards",
			"moveTask",
			"reorderColumns",
			"reorderTasks",
			"updateBoard",
			"updateColumn",
			"updateTask",
		]);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([key, operation]) => [
					key,
					operation.permission.id,
				]),
			),
		).toEqual({
			listBoards: "kanban:board.read",
			getBoard: "kanban:board.read",
			createBoard: "kanban:board.create",
			updateBoard: "kanban:board.update",
			deleteBoard: "kanban:board.delete",
			createColumn: "kanban:column.create",
			updateColumn: "kanban:column.update",
			deleteColumn: "kanban:column.delete",
			reorderColumns: "kanban:column.reorder",
			createTask: "kanban:task.create",
			updateTask: "kanban:task.update",
			deleteTask: "kanban:task.delete",
			moveTask: "kanban:task.move",
			reorderTasks: "kanban:task.reorder",
		});

		expect(kanbanPermissions.board.read({ scope: "collection" })).toMatchObject(
			{ id: "kanban:board.read" },
		);
		expect(
			kanbanPermissions.task.move({
				boardId: "board-1",
				columnId: "column-1",
				targetColumnId: "column-2",
				taskId: "task-1",
				isArchived: false,
			}),
		).toMatchObject({ id: "kanban:task.move" });
		expect(() =>
			kanbanPermissions.task.update({
				boardId: "board-1",
				columnId: "column-1",
				taskId: "task-1",
				// @ts-expect-error Task status must be present in the catalog facts.
				isArchived: undefined,
			}),
		).toThrow();
	});
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
		organizationIds: z.array(z.string()),
	}),
	permissions: [kanbanPermissions] as const,
	rules: ({ kanban }) => {
		const managesBoard = ({
			identity,
			facts,
		}: {
			identity: {
				id: string;
				role: "user" | "admin";
				organizationIds: string[];
			} | null;
			facts: { ownerId?: string; organizationId?: string };
		}) =>
			identity?.role === "admin" ||
			identity?.id === facts.ownerId ||
			Boolean(
				facts.organizationId &&
					identity?.organizationIds.includes(facts.organizationId),
			);
		return [
			kanban.board.read.when(({ identity, facts }) =>
				facts.scope === "collection"
					? identity?.role === "admin"
					: managesBoard({ identity, facts }),
			),
			kanban.board.create.when(({ identity }) => identity !== null),
			kanban.board.update.when(
				({ identity, facts }) =>
					identity?.role === "admin" || identity?.id === facts.ownerId,
			),
			kanban.board.delete.when(
				({ identity, facts }) =>
					identity?.role === "admin" || identity?.id === facts.ownerId,
			),
			kanban.column.create.when(managesBoard),
			kanban.column.update.when(managesBoard),
			kanban.column.delete.when(managesBoard),
			kanban.column.reorder.when(managesBoard),
			kanban.task.create.when(managesBoard),
			kanban.task.update.when(managesBoard),
			kanban.task.delete.when(managesBoard),
			kanban.task.move.when(managesBoard),
			kanban.task.reorder.when(managesBoard),
		];
	},
});

type Identity = {
	id: string;
	role: "user" | "admin";
	organizationIds: string[];
};

function createAuth(
	getIdentity: (
		request: Request,
	) => Identity | null | Promise<Identity | null> = (request) => {
		const id = request.headers.get("x-user-id");
		const role = request.headers.get("x-user-role");
		if (!id || (role !== "user" && role !== "admin")) return null;
		return {
			id,
			role,
			organizationIds:
				request.headers.get("x-organization-ids")?.split(",").filter(Boolean) ??
				[],
		};
	},
	definition = authorization,
) {
	return createServerAuth({
		authorization: definition,
		getIdentity: ({ request }) => getIdentity(request),
	});
}

function makeBackend(options?: {
	hooks?: KanbanBackendHooks;
	auth?: ServerAuth<any>;
	adapter?: (db: DatabaseDefinition) => DBAdapter;
}) {
	return stack({
		basePath: "/api",
		plugins: {
			kanban: kanbanBackendPlugin(
				options?.hooks ? { hooks: options.hooks } : {},
			),
		},
		adapter: options?.adapter ?? rawMemoryAdapter,
		...(options?.auth ? { auth: options.auth as never } : {}),
	});
}

function request(
	path: string,
	options?: { method?: string; identity?: Identity; body?: unknown },
) {
	const headers = new Headers();
	if (options?.identity) {
		headers.set("x-user-id", options.identity.id);
		headers.set("x-user-role", options.identity.role);
		headers.set(
			"x-organization-ids",
			options.identity.organizationIds.join(","),
		);
	}
	if (options?.body !== undefined)
		headers.set("content-type", "application/json");
	return new Request(`http://localhost/api${path}`, {
		method: options?.method ?? "GET",
		headers,
		...(options?.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
}

const owner = {
	id: "owner-1",
	role: "user",
	organizationIds: [],
} as const satisfies Identity;
const member = {
	id: "member-1",
	role: "user",
	organizationIds: ["org-1"],
} as const satisfies Identity;
const viewer = {
	id: "viewer-1",
	role: "user",
	organizationIds: [],
} as const satisfies Identity;
const admin = {
	id: "admin-1",
	role: "admin",
	organizationIds: [],
} as const satisfies Identity;

async function seedBoard(
	backend: ReturnType<typeof makeBackend>,
	overrides: Partial<Board> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Board>({
		model: "kanbanBoard",
		data: {
			name: "Roadmap",
			slug: "roadmap",
			ownerId: owner.id,
			organizationId: "org-1",
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

async function seedColumn(
	backend: ReturnType<typeof makeBackend>,
	boardId: string,
	overrides: Partial<Column> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Column>({
		model: "kanbanColumn",
		data: {
			title: "Todo",
			order: 0,
			boardId,
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

async function seedTask(
	backend: ReturnType<typeof makeBackend>,
	columnId: string,
	overrides: Partial<Task> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Task>({
		model: "kanbanTask",
		data: {
			title: "Ship authorization",
			priority: "HIGH",
			order: 0,
			columnId,
			assigneeId: member.id,
			isArchived: false,
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

describe("Kanban operation-first authorization", () => {
	it("preserves omitted-auth compatibility while retaining validation and hooks", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			adapter: rawMemoryAdapter,
			hooks: {
				onBeforeCreateBoard: (_input, context) => {
					events.push(`before:${context.identity?.id ?? "anonymous"}`);
				},
				onBoardCreated: (_board, context) => {
					events.push(`after:${context.identity?.id ?? "anonymous"}`);
				},
			},
		});
		const response = await backend.handler(
			request("/boards", { method: "POST", body: { name: "Compatible" } }),
		);
		expect(response.status).toBe(200);
		const board = (await response.json()) as Board;
		expect(board).toMatchObject({ name: "Compatible" });
		const updateResponse = await backend.handler(
			request(`/boards/${board.id}`, {
				method: "PUT",
				body: { name: "Still compatible" },
			}),
		);
		expect(updateResponse.status).toBe(200);
		expect(await updateResponse.json()).toMatchObject({
			name: "Still compatible",
		});
		expect(events).toEqual(["before:anonymous", "after:anonymous"]);
	});

	it("runs typed board error hooks without replacing the domain failure", async () => {
		const events: string[] = [];
		const contexts: unknown[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeCreateBoard: (input, context) => {
					events.push("before");
					expect(input).toEqual({ name: "Rejected" });
					expect(context.identity).toEqual(owner);
					throw new Error("workflow rejected");
				},
				onCreateBoardError: (error, context) => {
					events.push("error");
					contexts.push(context);
					expect(error).toMatchObject({
						message: "workflow rejected",
						code: "CREATE_BOARD_REJECTED",
					});
					throw new Error("observer failed");
				},
				onBoardCreated: () => {
					events.push("after");
				},
			},
		});

		await expect(
			backend
				.forRequest(request("/create", { identity: owner }))
				.api.kanban.createBoard({ name: "Rejected" }),
		).rejects.toMatchObject({
			message: "workflow rejected",
			code: "CREATE_BOARD_REJECTED",
		});
		expect(events).toEqual(["before", "error"]);
		expect(contexts).toEqual([
			expect.objectContaining({
				input: { name: "Rejected" },
				facts: undefined,
				identity: owner,
			}),
		]);
		expect(contexts[0]).not.toHaveProperty("result");
		expect(await backend.adapter.count({ model: "kanbanBoard" })).toBe(0);
	});

	it("rejects board creation without atomic transactions before hooks or writes", async () => {
		const beforeCreate = vi.fn();
		const sequentialAdapter = (db: DatabaseDefinition) => {
			const memory = rawMemoryAdapter(db);
			const adapterConfig = memory.options?.adapterConfig;
			if (!adapterConfig) throw new Error("Missing adapter config");
			return {
				...memory,
				id: "sequential",
				options: {
					...memory.options,
					adapterConfig: {
						...adapterConfig,
						transaction: false,
					},
				},
			} satisfies DBAdapter;
		};
		const backend = makeBackend({
			adapter: sequentialAdapter,
			hooks: { onBeforeCreateBoard: beforeCreate },
		});

		await expect(
			backend.internal.kanban.createBoard({ name: "Unsafe" }),
		).rejects.toMatchObject({
			statusCode: 500,
			code: "ATOMIC_TRANSACTION_REQUIRED",
		});
		expect(beforeCreate).not.toHaveBeenCalled();
		expect(await backend.adapter.count({ model: "kanbanBoard" })).toBe(0);
		expect(await backend.adapter.count({ model: "kanbanColumn" })).toBe(0);
	});

	it("rolls back nested board creation when its outer before hook rejects", async () => {
		let backend: ReturnType<typeof makeBackend>;
		backend = makeBackend({
			hooks: {
				onBeforeCreateBoard: async (input) => {
					if (input.name !== "Outer") return;
					await backend.internal.kanban.createBoard({ name: "Nested" });
					throw new Error("outer rejected");
				},
			},
		});

		await expect(
			backend.internal.kanban.createBoard({ name: "Outer" }),
		).rejects.toMatchObject({
			statusCode: 403,
			code: "CREATE_BOARD_REJECTED",
		});
		expect(await backend.adapter.count({ model: "kanbanBoard" })).toBe(0);
		expect(await backend.adapter.count({ model: "kanbanColumn" })).toBe(0);
	}, 1_000);

	it("returns 401/403 before hooks and allows owner, member, and admin where declared", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeReadBoard: () => {
					events.push("read");
				},
				onBeforeUpdateTask: () => {
					events.push("task");
				},
			},
		});
		const board = await seedBoard(backend);
		const column = await seedColumn(backend, board.id);
		await seedTask(backend, column.id, { title: "Earlier", order: 0 });
		const task = await seedTask(backend, column.id, { order: 1 });

		expect((await backend.handler(request(`/boards/${board.id}`))).status).toBe(
			401,
		);
		expect(
			(
				await backend.handler(
					request(`/boards/${board.id}`, { identity: viewer }),
				)
			).status,
		).toBe(403);
		expect(events).toEqual([]);
		expect(
			authorization.can(
				kanbanPermissions.task.update({
					boardId: board.id,
					ownerId: viewer.id,
					organizationId: "spoofed-org",
					columnId: column.id,
					taskId: task.id,
					isArchived: false,
				}),
				viewer,
			),
		).toBe(true);
		await expect(
			backend
				.forRequest(request("/spoofed", { identity: viewer }))
				.api.kanban.updateTask({
					id: task.id,
					data: { title: "Spoofed" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(events).toEqual([]);

		expect(
			(
				await backend.handler(
					request(`/boards/${board.id}`, { identity: owner }),
				)
			).status,
		).toBe(200);
		await expect(
			backend
				.forRequest(request("/member", { identity: member }))
				.api.kanban.updateTask({
					id: task.id,
					data: { title: "Member edit" },
				}),
		).resolves.toMatchObject({
			title: "Member edit",
			priority: "HIGH",
			order: 1,
			isArchived: false,
		});
		await expect(
			backend
				.forRequest(request("/admin", { identity: admin }))
				.api.kanban.listBoards({}),
		).resolves.toMatchObject({ total: 1 });
		expect(events).toEqual(["read", "task"]);
	});

	it("requires column reorder permission when ordinary updates include order", async () => {
		const events: string[] = [];
		const updateWithoutReorder = defineAuthorization({
			identity: z.object({
				id: z.string(),
				role: z.enum(["user", "admin"]),
				organizationIds: z.array(z.string()),
			}),
			permissions: [kanbanPermissions] as const,
			rules: ({ kanban }) => [
				kanban.column.update.when(() => true),
				kanban.column.reorder.when(() => false),
			],
		});
		const backend = makeBackend({
			auth: createAuth(undefined, updateWithoutReorder),
			hooks: {
				onBeforeUpdateColumn: () => {
					events.push("before");
				},
			},
		});
		const board = await seedBoard(backend);
		const column = await seedColumn(backend, board.id);
		const response = await backend.handler(
			request(`/columns/${column.id}`, {
				method: "PUT",
				identity: owner,
				body: { order: 1 },
			}),
		);
		expect(response.status).toBe(403);
		expect(events).toEqual([]);
		expect(
			await backend.adapter.findOne<Column>({
				model: "kanbanColumn",
				where: [{ field: "id", value: column.id }],
			}),
		).toMatchObject({ order: 0 });

		await expect(
			backend
				.forRequest(request("/member", { identity: owner }))
				.api.kanban.updateColumn({
					id: column.id,
					data: { order: undefined },
				}),
		).rejects.toBeInstanceOf(z.ZodError);
		expect(events).toEqual([]);
		expect(
			await backend.adapter.findOne<Column>({
				model: "kanbanColumn",
				where: [{ field: "id", value: column.id }],
			}),
		).toMatchObject({ order: 0 });
	});

	it("fails closed across every anonymous HTTP operation", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const board = await seedBoard(backend);
		const first = await seedColumn(backend, board.id);
		const second = await seedColumn(backend, board.id, {
			title: "Done",
			order: 1,
		});
		const task = await seedTask(backend, first.id);
		const protectedRequests = [
			request("/boards"),
			request(`/boards/${board.id}`),
			request("/boards", { method: "POST", body: { name: "Denied" } }),
			request(`/boards/${board.id}`, {
				method: "PUT",
				body: { name: "Denied" },
			}),
			request(`/boards/${board.id}`, { method: "DELETE" }),
			request("/columns", {
				method: "POST",
				body: { title: "Denied", boardId: board.id },
			}),
			request(`/columns/${first.id}`, {
				method: "PUT",
				body: { title: "Denied" },
			}),
			request(`/columns/${first.id}`, { method: "DELETE" }),
			request("/columns/reorder", {
				method: "POST",
				body: { boardId: board.id, columnIds: [second.id, first.id] },
			}),
			request("/tasks", {
				method: "POST",
				body: { title: "Denied", columnId: first.id },
			}),
			request(`/tasks/${task.id}`, {
				method: "PUT",
				body: { title: "Denied" },
			}),
			request(`/tasks/${task.id}`, { method: "DELETE" }),
			request("/tasks/move", {
				method: "POST",
				body: { taskId: task.id, targetColumnId: second.id, targetOrder: 0 },
			}),
			request("/tasks/reorder", {
				method: "POST",
				body: { columnId: first.id, taskIds: [task.id] },
			}),
		];
		for (const protectedRequest of protectedRequests) {
			expect((await backend.handler(protectedRequest)).status).toBe(401);
		}
	});
	it("ignores client-supplied ownership on board create and update", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const createdResponse = await backend.handler(
			request("/boards", {
				method: "POST",
				identity: viewer,
				body: {
					name: "Owned by the caller",
					ownerId: admin.id,
					organizationId: "other-tenant",
				},
			}),
		);
		expect(createdResponse.status).toBe(200);
		const created = (await createdResponse.json()) as Board;
		expect(created).toMatchObject({ ownerId: viewer.id });
		expect(created.organizationId).toBeUndefined();

		const updatedResponse = await backend.handler(
			request(`/boards/${created.id}`, {
				method: "PUT",
				identity: viewer,
				body: {
					name: "Still owned by the caller",
					ownerId: admin.id,
					organizationId: "other-tenant",
				},
			}),
		);
		expect(updatedResponse.status).toBe(200);
		expect(await updatedResponse.json()).toMatchObject({
			name: "Still owned by the caller",
			ownerId: viewer.id,
		});
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: created.id }],
			}),
		).toMatchObject({ ownerId: viewer.id, organizationId: undefined });

		const requestApi = backend.forRequest(
			request("/programmatic", { identity: viewer }),
		).api.kanban;
		const programmatic = await requestApi.createBoard({
			name: "Programmatic",
			ownerId: admin.id,
			organizationId: "other-tenant",
		} as { name: string });
		expect(programmatic).toMatchObject({ ownerId: viewer.id });
		expect(programmatic.organizationId).toBeUndefined();
		await requestApi.updateBoard({
			id: programmatic.id,
			data: {
				name: "Programmatic update",
				ownerId: admin.id,
				organizationId: "other-tenant",
			} as { name: string },
		});
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: programmatic.id }],
			}),
		).toMatchObject({
			name: "Programmatic update",
			ownerId: viewer.id,
			organizationId: undefined,
		});
	});

	it("keeps HTTP, request, and internal behavior on one validated lifecycle", async () => {
		const getIdentity = vi.fn(({ headers }: Request) =>
			headers.get("x-user-id"),
		);
		const events: string[] = [];
		const backend = makeBackend({
			adapter: rawMemoryAdapter,
			auth: createAuth((incoming) => {
				getIdentity(incoming);
				return owner;
			}),
			hooks: {
				onBeforeUpdateBoard: (_id, _data, context) => {
					events.push(`before:${context.identity?.id ?? "internal"}`);
				},
				onBoardUpdated: (_board, context) => {
					events.push(`after:${context.identity?.id ?? "internal"}`);
				},
			},
		});
		const board = await seedBoard(backend);
		const response = await backend.handler(
			request(`/boards/${board.id}`, {
				method: "PUT",
				identity: owner,
				body: { name: "HTTP" },
			}),
		);
		expect(response.status).toBe(200);
		await backend
			.forRequest(request("/request", { identity: owner }))
			.api.kanban.updateBoard({ id: board.id, data: { name: "Request" } });
		await expect(
			backend.internal.kanban.updateBoard({ id: board.id, data: { name: "" } }),
		).rejects.toThrow();
		await backend.internal.kanban.updateBoard({
			id: board.id,
			data: { name: "Internal" },
		});
		expect(events).toEqual([
			"before:owner-1",
			"after:owner-1",
			"before:owner-1",
			"after:owner-1",
			"before:internal",
			"after:internal",
		]);
		expect(getIdentity).toHaveBeenCalledTimes(2);
	});

	it("keeps task ordering and lifecycle hooks active for trusted internal jobs", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			adapter: rawMemoryAdapter,
			auth: createAuth(() => {
				throw new Error("internal must not resolve identity");
			}),
			hooks: {
				onBeforeUpdateTask: (_id, _data, context) => {
					events.push(`before:${context.identity?.id ?? "internal"}`);
				},
				onTaskUpdated: (_task, context) => {
					events.push(`after:${context.identity?.id ?? "internal"}`);
				},
			},
		});
		const board = await seedBoard(backend);
		const source = await seedColumn(backend, board.id);
		const target = await seedColumn(backend, board.id, {
			title: "Done",
			order: 1,
		});
		const moved = await seedTask(backend, source.id);
		const sibling = await seedTask(backend, target.id, {
			title: "Existing",
			order: 0,
		});
		await backend.internal.kanban.moveTask({
			taskId: moved.id,
			targetColumnId: target.id,
			targetOrder: 0,
		});
		const tasks = await backend.adapter.findMany<Task>({
			model: "kanbanTask",
			where: [{ field: "columnId", value: target.id }],
			sortBy: { field: "order", direction: "asc" },
		});
		expect(tasks.map(({ id, order }) => [id, order])).toEqual([
			[moved.id, 0],
			[sibling.id, 1],
		]);
		expect(events).toEqual(["before:internal", "after:internal"]);
	});

	it("preserves identity/rule/fact failures and missing rules before hooks", async () => {
		const missing = defineAuthorization({
			identity: z.object({
				id: z.string(),
				role: z.enum(["user", "admin"]),
				organizationIds: z.array(z.string()),
			}),
			permissions: [kanbanPermissions] as const,
			rules: ({ kanban }) => [kanban.board.create.when(() => true)],
		});
		const missingBackend = makeBackend({
			auth: createAuth(undefined, missing),
		});
		const board = await seedBoard(missingBackend);
		await expect(
			missingBackend
				.forRequest(request("/missing", { identity: owner }))
				.api.kanban.updateBoard({ id: board.id, data: { name: "No" } }),
		).rejects.toMatchObject({ statusCode: 403 });

		const identityFailure = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
		});
		const identityBoard = await seedBoard(identityFailure, {
			slug: "identity",
		});
		await expect(
			identityFailure.forRequest(request("/identity")).api.kanban.updateBoard({
				id: identityBoard.id,
				data: { name: "No" },
			}),
		).rejects.toThrow("session unavailable");

		const failing = defineAuthorization({
			identity: z.object({
				id: z.string(),
				role: z.enum(["user", "admin"]),
				organizationIds: z.array(z.string()),
			}),
			permissions: [kanbanPermissions] as const,
			rules: ({ kanban }) => [
				kanban.board.update.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const ruleFailure = makeBackend({ auth: createAuth(undefined, failing) });
		const ruleBoard = await seedBoard(ruleFailure, { slug: "rule" });
		await expect(
			ruleFailure
				.forRequest(request("/rule", { identity: owner }))
				.api.kanban.updateBoard({
					id: ruleBoard.id,
					data: { name: "No" },
				}),
		).rejects.toThrow("policy unavailable");

		const factEvents: string[] = [];
		const factFailure = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeUpdateBoard: () => {
					factEvents.push("hook");
				},
			},
		});
		const factBoard = await seedBoard(factFailure, { slug: "facts" });
		vi.spyOn(factFailure.adapter, "findOne").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		await expect(
			factFailure
				.forRequest(request("/facts", { identity: owner }))
				.api.kanban.updateBoard({
					id: factBoard.id,
					data: { name: "No" },
				}),
		).rejects.toThrow("database unavailable");
		expect(factEvents).toEqual([]);
	});

	it("rejects stale authoritative facts before hooks without reverting the winner", async () => {
		const events: string[] = [];
		let backend: ReturnType<typeof makeBackend>;
		let raced = false;
		backend = makeBackend({
			auth: createAuth(async () => {
				if (!raced) {
					raced = true;
					const board = await backend.adapter.findOne<Board>({
						model: "kanbanBoard",
						where: [{ field: "slug", value: "race" }],
					});
					if (board) {
						await backend.adapter.update<Board>({
							model: "kanbanBoard",
							where: [{ field: "id", value: board.id }],
							update: {
								ownerId: viewer.id,
								updatedAt: new Date("2026-02-01T00:00:00.000Z"),
							},
						});
					}
				}
				return owner;
			}),
			hooks: {
				onBeforeUpdateBoard: () => {
					events.push("hook");
				},
			},
		});
		const board = await seedBoard(backend, { slug: "race" });
		await expect(
			backend
				.forRequest(request("/race"))
				.api.kanban.updateBoard({ id: board.id, data: { name: "Stale" } }),
		).rejects.toMatchObject({ statusCode: 409, code: "KANBAN_STATE_CHANGED" });
		expect(events).toEqual([]);
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: board.id }],
			}),
		).toMatchObject({ ownerId: viewer.id, name: "Roadmap" });
	});

	it("serializes raw-memory rollback without overwriting API or raw winners", async () => {
		const events: string[] = [];
		let markRejectedHookStarted = () => {};
		const rejectedHookStarted = new Promise<void>((resolve) => {
			markRejectedHookStarted = resolve;
		});
		let releaseRejectedHook = () => {};
		const rejectedHookGate = new Promise<void>((resolve) => {
			releaseRejectedHook = resolve;
		});
		const backend = makeBackend({
			auth: createAuth(),
			adapter: rawMemoryAdapter,
			hooks: {
				onBeforeUpdateBoard: async (_id, data) => {
					events.push(data.name ?? "missing");
					if (data.name === "Rejected") {
						markRejectedHookStarted();
						await rejectedHookGate;
						throw new Error("workflow rejected");
					}
				},
			},
		});
		const board = await seedBoard(backend);
		const api = backend.forRequest(request("/race", { identity: owner })).api
			.kanban;
		const rejected = api.updateBoard({
			id: board.id,
			data: { name: "Rejected" },
		});
		await rejectedHookStarted;
		const now = new Date();
		const rawWinner = backend.adapter.create<Board>({
			model: "kanbanBoard",
			data: {
				name: "Raw winner",
				slug: "raw-winner",
				createdAt: now,
				updatedAt: now,
			},
		});
		const winner = api.updateBoard({
			id: board.id,
			data: { name: "Winner" },
		});
		releaseRejectedHook();
		await expect(rejected).rejects.toMatchObject({
			statusCode: 403,
			code: "UPDATE_BOARD_REJECTED",
		});
		await expect(winner).resolves.toMatchObject({ name: "Winner" });
		await expect(rawWinner).resolves.toMatchObject({ name: "Raw winner" });
		expect(events).toEqual(["Rejected", "Winner"]);
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: board.id }],
			}),
		).toMatchObject({ name: "Winner" });
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "slug", value: "raw-winner" }],
			}),
		).toMatchObject({ name: "Raw winner" });
	});

	it("keeps awaited nested hook operations in the raw-memory transaction context", async () => {
		let backend: ReturnType<typeof makeBackend>;
		const nestedNames: string[] = [];
		backend = makeBackend({
			auth: createAuth(),
			adapter: rawMemoryAdapter,
			hooks: {
				onBeforeUpdateBoard: async (id) => {
					const nested = await backend.internal.kanban.getBoard({ id });
					nestedNames.push(nested.name);
				},
			},
		});
		const board = await seedBoard(backend);
		await expect(
			backend
				.forRequest(request("/nested", { identity: owner }))
				.api.kanban.updateBoard({
					id: board.id,
					data: { name: "Updated" },
				}),
		).resolves.toMatchObject({ name: "Updated" });
		expect(nestedNames).toEqual(["Roadmap"]);
	}, 1_000);

	it("rolls back a caught nested after-hook failure with its raw-memory parent", async () => {
		let backend: ReturnType<typeof makeBackend>;
		let outerId = "";
		let nestedId = "";
		const caught: string[] = [];
		backend = makeBackend({
			auth: createAuth(),
			adapter: rawMemoryAdapter,
			hooks: {
				onBeforeUpdateBoard: async (id) => {
					if (id !== outerId) return;
					try {
						await backend.internal.kanban.updateBoard({
							id: nestedId,
							data: { name: "Nested change" },
						});
					} catch (error) {
						caught.push(error instanceof Error ? error.message : "unknown");
					}
				},
				onBoardUpdated: (board) => {
					if (board.id === nestedId) throw new Error("nested after rejected");
				},
			},
		});
		const outer = await seedBoard(backend, { slug: "outer" });
		const nested = await seedBoard(backend, {
			name: "Nested original",
			slug: "nested",
		});
		outerId = outer.id;
		nestedId = nested.id;
		await expect(
			backend
				.forRequest(request("/nested-write", { identity: owner }))
				.api.kanban.updateBoard({
					id: outer.id,
					data: { name: "Outer change" },
				}),
		).rejects.toThrow("nested after rejected");
		expect(caught).toEqual(["nested after rejected"]);
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: outer.id }],
			}),
		).toMatchObject({ name: "Roadmap" });
		expect(
			await backend.adapter.findOne<Board>({
				model: "kanbanBoard",
				where: [{ field: "id", value: nested.id }],
			}),
		).toMatchObject({ name: "Nested original" });
	}, 1_000);

	it("serializes competing moves, preserves ordering, and runs only the winning hook", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			adapter: rawMemoryAdapter,
			hooks: {
				onBeforeUpdateTask: (id) => {
					events.push(id);
				},
			},
		});
		const board = await seedBoard(backend);
		const source = await seedColumn(backend, board.id);
		const target = await seedColumn(backend, board.id, {
			title: "Done",
			order: 1,
		});
		const moved = await seedTask(backend, source.id);
		const sourceSibling = await seedTask(backend, source.id, {
			title: "Source sibling",
			order: 1,
		});
		const targetSibling = await seedTask(backend, target.id, {
			title: "Target sibling",
			order: 0,
		});
		const api = backend.forRequest(request("/move", { identity: owner })).api
			.kanban;
		const settled = await Promise.allSettled([
			api.moveTask({
				taskId: moved.id,
				targetColumnId: target.id,
				targetOrder: 0,
			}),
			api.moveTask({
				taskId: moved.id,
				targetColumnId: target.id,
				targetOrder: 1,
			}),
		]);
		expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		expect(events).toEqual([moved.id]);
		const sourceTasks = await backend.adapter.findMany<Task>({
			model: "kanbanTask",
			where: [{ field: "columnId", value: source.id }],
			sortBy: { field: "order", direction: "asc" },
		});
		const targetTasks = await backend.adapter.findMany<Task>({
			model: "kanbanTask",
			where: [{ field: "columnId", value: target.id }],
			sortBy: { field: "order", direction: "asc" },
		});
		expect(sourceTasks.map(({ id, order }) => [id, order])).toEqual([
			[sourceSibling.id, 0],
		]);
		expect(targetTasks.map((task) => task.id).sort()).toEqual(
			[moved.id, targetSibling.id].sort(),
		);
		expect(targetTasks.map((task) => task.order).sort()).toEqual([0, 1]);
	});

	it("rolls back move claims when a post-authorization domain hook rejects", async () => {
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeUpdateTask: () => {
					throw new Error("workflow rejected");
				},
			},
		});
		const board = await seedBoard(backend);
		const source = await seedColumn(backend, board.id);
		const target = await seedColumn(backend, board.id, {
			title: "Done",
			order: 1,
		});
		const task = await seedTask(backend, source.id);
		await expect(
			backend
				.forRequest(request("/rejected", { identity: owner }))
				.api.kanban.moveTask({
					taskId: task.id,
					targetColumnId: target.id,
					targetOrder: 0,
				}),
		).rejects.toMatchObject({ statusCode: 403, code: "MOVE_TASK_REJECTED" });
		expect(
			await backend.adapter.findOne<Task>({
				model: "kanbanTask",
				where: [{ field: "id", value: task.id }],
			}),
		).toMatchObject({ columnId: source.id, order: 0 });
	});

	it("keeps trusted raw helpers out of authorized namespaces and documents raw SSG data", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const board = await seedBoard(backend);
		const column = await seedColumn(backend, board.id);
		await seedTask(backend, column.id);
		expect("prefetchForRoute" in backend.internal.kanban).toBe(false);
		expect("getAllBoards" in backend.internal.kanban).toBe(false);
		expect("createTask" in backend.internal.kanban).toBe(true);
		expect(
			"prefetchForRoute" in backend.forRequest(request("/raw")).api.kanban,
		).toBe(false);
		const queryClient = new QueryClient();
		const prefetchFindMany = vi.spyOn(backend.adapter, "findMany");
		await backend.api.kanban.prefetchForRoute("boards", queryClient);
		expect(
			prefetchFindMany.mock.calls.some(
				([query]) => query.model === "kanbanBoard",
			),
		).toBe(true);
		expect(
			prefetchFindMany.mock.calls.some(
				([query]) => query.model === "kanbanTask",
			),
		).toBe(false);
		expect(
			queryClient.getQueryData<Array<{ columns: Array<unknown> }>>(
				KANBAN_QUERY_KEYS.boardsList({}),
			),
		).toEqual([
			expect.objectContaining({
				id: board.id,
				columns: [expect.not.objectContaining({ tasks: expect.anything() })],
			}),
		]);
		await backend.api.kanban.prefetchForRoute("board", queryClient, {
			boardId: board.id,
		});
		expect(
			queryClient.getQueryData(KANBAN_QUERY_KEYS.boardDetail(board.id)),
		).toMatchObject({
			id: board.id,
		});
	});
});
