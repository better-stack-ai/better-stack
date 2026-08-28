// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	StackProvider,
	type StackIdentity,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { BoardForm } from "../client/components/forms/board-form";
import { ColumnForm } from "../client/components/forms/column-form";
import { TaskForm } from "../client/components/forms/task-form";
import { BoardPage } from "../client/components/pages/board-page.internal";
import { BoardPageComponent } from "../client/components/pages/board-page";
import { BoardsListPage } from "../client/components/pages/boards-list-page.internal";
import { BoardsListPageComponent } from "../client/components/pages/boards-list-page";
import { NewBoardPageComponent } from "../client/components/pages/new-board-page";
import { KanbanBoard } from "../client/components/shared/kanban-board";
import { kanbanResources } from "../query-keys";
import { kanbanPermissions } from "../permissions";
import type {
	SerializedBoard,
	SerializedColumn,
	SerializedTask,
} from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hooks = vi.hoisted(() => ({
	useSuspenseBoards: vi.fn(),
	useSuspenseBoard: vi.fn(),
	useBoardForm: vi.fn(),
	useColumnForm: vi.fn(),
	useTaskForm: vi.fn(),
	useBoardMutations: vi.fn(),
	useColumnMutations: vi.fn(),
	useTaskMutations: vi.fn(),
	useResolveUser: vi.fn(),
	useSearchUsers: vi.fn(),
}));

vi.mock("../client/hooks/kanban-hooks", () => hooks);

vi.mock("@workspace/ui/components/minimal-tiptap", () => ({
	MinimalTiptapEditor: () => <div data-testid="task-description-editor" />,
}));

vi.mock("@workspace/ui/components/search-select", () => ({
	default: () => <div data-testid="assignee-select" />,
}));

const board: SerializedBoard = {
	id: "board-1",
	name: "Roadmap",
	slug: "roadmap",
	description: "Team roadmap",
	ownerId: "owner-1",
	organizationId: "org-1",
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
};

const column: SerializedColumn = {
	id: "column-1",
	boardId: board.id,
	title: "To Do",
	order: 0,
	tasks: [],
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
};

const task: SerializedTask = {
	id: "task-1",
	columnId: column.id,
	title: "Ship it",
	description: "",
	priority: "MEDIUM",
	order: 0,
	isArchived: false,
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-01").toISOString(),
};

let container: HTMLDivElement;
let root: Root;

const formResult = {
	action: "create",
	record: null,
	isLoadingRecord: false,
	recordError: null,
	defaultValues: undefined,
	submit: vi.fn(),
	isSubmitting: false,
	error: null,
	fieldErrors: {},
	clearErrors: vi.fn(),
};

const kanbanOverrides = {
	resolveUser: vi.fn(),
	searchUsers: vi.fn().mockResolvedValue([]),
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);

	hooks.useSuspenseBoards.mockReturnValue({
		data: [],
		error: null,
		isFetching: false,
	});
	hooks.useSuspenseBoard.mockReturnValue({
		data: { ...board, columns: [] },
		error: null,
		isFetching: false,
		refetch: vi.fn(),
	});
	hooks.useBoardForm.mockReturnValue({ ...formResult });
	hooks.useColumnForm.mockReturnValue({ ...formResult });
	hooks.useTaskForm.mockReturnValue({ ...formResult });
	hooks.useBoardMutations.mockReturnValue({
		deleteBoard: vi.fn(),
		isDeleting: false,
	});
	hooks.useColumnMutations.mockReturnValue({
		deleteColumn: vi.fn(),
		reorderColumns: vi.fn(),
	});
	hooks.useTaskMutations.mockReturnValue({
		deleteTask: vi.fn(),
		moveTask: vi.fn().mockResolvedValue(task),
		reorderTasks: vi.fn(),
		isMoving: false,
	});
	hooks.useResolveUser.mockReturnValue({ data: null });
	hooks.useSearchUsers.mockReturnValue({ data: [] });
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	document.body.innerHTML = "";
	vi.clearAllMocks();
});

async function render(
	ui: React.ReactElement,
	options: {
		auth?: StackAuthProvider;
		initialIdentity?: StackIdentity | null;
		i18n?: StackI18nProvider;
		localization?: Record<string, string>;
	} = {},
) {
	await act(async () => {
		root.render(
			<StackProvider
				basePath="/pages"
				auth={options.auth}
				initialIdentity={options.initialIdentity}
				i18n={options.i18n}
				overrides={{
					kanban: {
						...kanbanOverrides,
						localization: options.localization,
					},
				}}
			>
				{ui}
			</StackProvider>,
		);
	});
}

async function waitFor(check: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

function texts(): string {
	return document.body.textContent ?? "";
}

const kanbanAuthorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["viewer", "admin"]),
	}),
	permissions: [kanbanPermissions] as const,
	rules: ({ kanban }) => {
		const ownsBoard = (
			identity: { id: string; role: "viewer" | "admin" } | null,
			facts: { ownerId?: string },
		) => identity?.role === "admin" || identity?.id === facts.ownerId;

		return [
			kanban.board.read.when(({ identity, facts }) =>
				facts.scope === "collection" ? true : ownsBoard(identity, facts),
			),
			kanban.board.create.when(({ identity }) => identity?.role === "admin"),
			kanban.board.update.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.board.delete.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.column.create.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.column.update.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.column.delete.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.column.reorder.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.task.create.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.task.update.when(
				({ identity, facts }) =>
					ownsBoard(identity, facts) || identity?.id === facts.assigneeId,
			),
			kanban.task.move.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.task.delete.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
			kanban.task.reorder.when(({ identity, facts }) =>
				ownsBoard(identity, facts),
			),
		];
	},
});

function oneRuleAuth(identity: { id: string; role: "viewer" | "admin" }) {
	return createClientAuth({
		authorization: kanbanAuthorization,
		getIdentity: () => identity,
	});
}

describe("maintained Kanban route authorization", () => {
	const deniedAuthorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.literal("viewer") }),
		permissions: [kanbanPermissions] as const,
		rules: ({ kanban }) => [
			kanban.board.read.when(() => false),
			kanban.board.create.when(() => false),
		],
	});
	const identity = { id: "viewer-1", role: "viewer" as const };
	const auth = createClientAuth({
		authorization: deniedAuthorization,
		getIdentity: () => identity,
	});

	it.each([
		{
			label: "board collection",
			page: <BoardsListPageComponent />,
			selector: '[data-testid="boards-list-page"]',
		},
		{
			label: "board create",
			page: <NewBoardPageComponent />,
			selector: '[data-testid="new-board-page"]',
		},
		{
			label: "board record",
			page: <BoardPageComponent boardId={board.id} />,
			selector: '[data-testid="board-page"]',
		},
	] as const)(
		"fails closed at the $label route boundary",
		async ({ page, selector }) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			await render(page, { auth, initialIdentity: identity });
			await waitFor(() => texts().includes("Something went wrong"));

			expect(container.querySelector(selector)).toBeNull();
		},
	);

	it("loads a board before gating its route with exact response facts", async () => {
		const readRule = vi.fn(
			({
				identity,
				facts,
			}: {
				identity: { id: string; role: "viewer" } | null;
				facts:
					| { scope: "collection" }
					| {
							scope: "record";
							boardId: string;
							ownerId?: string;
							organizationId?: string;
							exists: boolean;
					  };
			}) =>
				facts.scope === "record" &&
				facts.exists &&
				facts.boardId === board.id &&
				facts.ownerId === identity?.id &&
				facts.organizationId === "org-1",
		);
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("viewer") }),
			permissions: [kanbanPermissions] as const,
			rules: ({ kanban }) => [kanban.board.read.when(readRule)],
		});
		const owner = { id: "owner-1", role: "viewer" as const };
		const ownerAuth = createClientAuth({
			authorization,
			getIdentity: () => owner,
		});

		await render(<BoardPageComponent boardId={board.id} />, {
			auth: ownerAuth,
			initialIdentity: owner,
		});
		await waitFor(
			() => container.querySelector('[data-testid="board-page"]') !== null,
		);

		expect(readRule).toHaveBeenCalledWith(
			expect.objectContaining({
				identity: owner,
				facts: {
					scope: "record",
					boardId: board.id,
					ownerId: "owner-1",
					organizationId: "org-1",
					exists: true,
				},
			}),
		);
	});
});

describe("Kanban permissions", () => {
	it("shows create-board controls when auth is not configured", async () => {
		await render(<BoardsListPage />);
		expect(texts()).toContain("Create Board");
	});

	it("hides create-board controls when permission is denied", async () => {
		const identity = { id: "viewer-1", role: "viewer" as const };
		const auth = oneRuleAuth(identity);

		await render(<BoardsListPage />, { auth, initialIdentity: identity });
		await waitFor(() => !texts().includes("Create Board"));

		expect(texts()).toContain("No boards yet");
		expect(
			kanbanAuthorization.can(kanbanPermissions.board.create(), identity),
		).toBe(false);
	});

	it("shows board controls from one shared rule using response ownership", async () => {
		const owner = { id: "owner-1", role: "viewer" as const };
		await render(<BoardPage boardId={board.id} />, {
			auth: oneRuleAuth(owner),
			initialIdentity: owner,
		});
		await waitFor(() => texts().includes("Actions"));

		expect(texts()).toContain("Actions");
		expect(texts()).toContain("Add Column");
		expect(
			kanbanAuthorization.can(
				kanbanPermissions.board.update({
					boardId: board.id,
					ownerId: board.ownerId,
					organizationId: board.organizationId,
				}),
				owner,
			),
		).toBe(true);
	});

	it("passes exact task facts to delete and target-specific move controls", async () => {
		const seenFacts: unknown[] = [];
		const seenMoveFacts: unknown[] = [];
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.literal("viewer") }),
			permissions: [kanbanPermissions] as const,
			rules: ({ kanban }) => [
				kanban.task.move.when(({ facts }) => {
					seenMoveFacts.push(facts);
					return false;
				}),
				kanban.task.delete.when(({ facts }) => {
					seenFacts.push(facts);
					return true;
				}),
			],
		});
		const identity = { id: "owner-1", role: "viewer" as const };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});
		const assignedTask = { ...task, assigneeId: "assignee-1" };
		const targetColumn = {
			...column,
			id: "column-2",
			title: "Done",
			tasks: [],
		};

		await render(
			<TaskForm
				boardId={board.id}
				ownerId={board.ownerId}
				organizationId={board.organizationId}
				columnId={column.id}
				taskId={assignedTask.id}
				task={assignedTask}
				columns={[column, targetColumn]}
				onClose={() => {}}
				onSuccess={() => {}}
				onDelete={() => {}}
			/>,
			{ auth, initialIdentity: identity },
		);

		expect(texts()).toContain("Delete");
		const trigger = container.querySelector<HTMLButtonElement>("button#column");
		expect(trigger).not.toBeNull();
		Object.assign(trigger ?? {}, {
			hasPointerCapture: () => false,
			setPointerCapture: () => {},
			releasePointerCapture: () => {},
		});
		await act(async () => {
			trigger?.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
			);
		});
		await waitFor(() => seenMoveFacts.length > 0);
		expect(texts()).not.toContain("Done");
		expect(seenFacts).toContainEqual({
			boardId: board.id,
			ownerId: board.ownerId,
			organizationId: board.organizationId,
			columnId: column.id,
			taskId: task.id,
			assigneeId: "assignee-1",
			isArchived: false,
		});
		expect(seenMoveFacts).toContainEqual({
			boardId: board.id,
			ownerId: board.ownerId,
			organizationId: board.organizationId,
			columnId: column.id,
			targetColumnId: targetColumn.id,
			taskId: task.id,
			assigneeId: "assignee-1",
			isArchived: false,
		});
	});

	it.each([
		{ move: true, reorder: false, expected: 0 },
		{ move: false, reorder: true, expected: 0 },
		{ move: true, reorder: true, expected: 1 },
	])(
		"requires both move=$move and reorder=$reorder for the shared drag handle",
		async ({ move, reorder, expected }) => {
			const authorization = defineAuthorization({
				identity: z.object({ id: z.string(), role: z.literal("viewer") }),
				permissions: [kanbanPermissions] as const,
				rules: ({ kanban }) => [
					kanban.task.update.when(() => false),
					kanban.task.move.when(() => move),
					kanban.task.reorder.when(() => reorder),
				],
			});
			const identity = { id: "owner-1", role: "viewer" as const };
			const auth = createClientAuth({
				authorization,
				getIdentity: () => identity,
			});
			const columnWithTask = { ...column, tasks: [task] };

			await render(
				<KanbanBoard
					boardId={board.id}
					ownerId={board.ownerId}
					organizationId={board.organizationId}
					columns={[columnWithTask]}
					kanbanState={{ [column.id]: [task] }}
					onKanbanChange={() => {}}
					onAddTask={() => {}}
					onEditTask={() => {}}
					onEditColumn={() => {}}
					onDeleteColumn={() => {}}
				/>,
				{ auth, initialIdentity: identity },
			);

			expect(
				container.querySelectorAll("button svg.lucide-grip-vertical"),
			).toHaveLength(expected);
		},
	);

	it("keeps legacy RC string providers working during the migration", async () => {
		const can = vi.fn(
			(_request: { resource: string; action: string }) => false,
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await render(<BoardPage boardId={board.id} />, { auth });
		await waitFor(() =>
			can.mock.calls.some(
				([request]) =>
					request.resource === "kanban:board" && request.action === "delete",
			),
		);

		expect(texts()).not.toContain("Actions");
		expect(texts()).not.toContain("Add Column");
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "kanban:board",
				action: "update",
				params: expect.objectContaining({
					id: board.id,
					ownerId: board.ownerId,
					organizationId: board.organizationId,
				}),
			}),
		);
	});

	it("mirrors authoritative task facts in legacy target-column checks", async () => {
		const can = vi.fn(
			(_request: {
				resource: string;
				action: string;
				params?: Record<string, unknown>;
			}) => false,
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "assignee-1" }),
			can,
		};
		const assignedTask = {
			...task,
			assigneeId: "assignee-1",
			isArchived: true,
		};
		const targetColumn = {
			...column,
			id: "column-2",
			title: "Done",
			tasks: [],
		};

		await render(
			<TaskForm
				boardId={board.id}
				ownerId={board.ownerId}
				organizationId={board.organizationId}
				columnId={column.id}
				taskId={assignedTask.id}
				task={assignedTask}
				columns={[column, targetColumn]}
				onClose={() => {}}
				onSuccess={() => {}}
			/>,
			{ auth },
		);

		const trigger = container.querySelector<HTMLButtonElement>("button#column");
		Object.assign(trigger ?? {}, {
			hasPointerCapture: () => false,
			setPointerCapture: () => {},
			releasePointerCapture: () => {},
		});
		await act(async () => {
			trigger?.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
			);
		});
		await waitFor(() =>
			can.mock.calls.some(
				([request]) => request.params?.targetColumnId === targetColumn.id,
			),
		);

		expect(can).toHaveBeenCalledWith({
			resource: "kanban:task",
			action: "update",
			identity: { id: "assignee-1" },
			params: {
				id: task.id,
				boardId: board.id,
				columnId: column.id,
				targetColumnId: targetColumn.id,
				ownerId: board.ownerId,
				organizationId: board.organizationId,
				assigneeId: "assignee-1",
				isArchived: true,
			},
		});
	});
});

describe("Kanban protected query keys", () => {
	it("partitions list, detail and slug queries by the full identity snapshot", () => {
		const userA = { id: "user-a", role: "viewer" };
		const userB = { id: "user-a", role: "admin" };
		const queries = kanbanResources.boards.queries;

		expect(queries.list.key({}, userA)).not.toEqual(
			queries.list.key({}, userB),
		);
		expect(queries.detail.key(board.id, userA)).not.toEqual(
			queries.detail.key(board.id, userB),
		);
		expect(queries.bySlug.key(board.slug, userA)).not.toEqual(
			queries.bySlug.key(board.slug),
		);
		expect(queries.detail.key(board.id, "pending:1")).not.toEqual(
			queries.detail.key(board.id),
		);
	});

	it("aligns trusted SSG with anonymous keys and broadly invalidates mutations", () => {
		const detail = kanbanResources.boards.queries.detail;
		expect(detail.key(board.id)).toEqual([board.id]);
		// Resolved anonymous hooks pass `undefined`, matching raw SSG hydration.
		expect(detail.key(board.id, undefined)).toEqual(detail.key(board.id));
		expect(kanbanResources.boards.mutations.create.invalidates).toEqual([
			"boards.list",
		]);
		expect(kanbanResources.boards.mutations.create).not.toHaveProperty(
			"setData",
		);
	});
});

describe("Kanban resource forms", () => {
	it("renders normalized server field errors inline", async () => {
		hooks.useBoardForm.mockReturnValue({
			...formResult,
			error: new Error("Validation failed"),
			fieldErrors: { name: "Server says the name is invalid" },
		});

		await render(<BoardForm onClose={() => {}} onSuccess={() => {}} />);

		expect(texts()).toContain("Server says the name is invalid");
	});

	it("wires all three forms to their public resource form hooks", async () => {
		await render(
			<>
				<BoardForm board={board} onClose={() => {}} onSuccess={() => {}} />
				<ColumnForm
					boardId={board.id}
					columnId={column.id}
					column={column}
					onClose={() => {}}
					onSuccess={() => {}}
				/>
				<TaskForm
					boardId={board.id}
					columnId={column.id}
					taskId={task.id}
					task={task}
					columns={[column]}
					onClose={() => {}}
					onSuccess={() => {}}
				/>
			</>,
		);

		expect(hooks.useBoardForm).toHaveBeenCalled();
		expect(hooks.useColumnForm).toHaveBeenCalled();
		expect(hooks.useTaskForm).toHaveBeenCalled();
	});

	it("submits a column change through one compound update operation", async () => {
		const targetColumn: SerializedColumn = {
			...column,
			id: "column-2",
			title: "Done",
			tasks: [{ ...task, id: "task-2", columnId: "column-2", order: 4 }],
		};

		await render(
			<TaskForm
				boardId={board.id}
				ownerId={board.ownerId}
				organizationId={board.organizationId}
				columnId={column.id}
				taskId={task.id}
				task={task}
				columns={[column, targetColumn]}
				onClose={() => {}}
				onSuccess={() => {}}
			/>,
		);

		const config = hooks.useTaskForm.mock.calls.at(-1)?.[0];
		const move = config.toUpdateVars({
			title: task.title,
			description: task.description,
			priority: task.priority,
			columnId: targetColumn.id,
			assigneeId: "",
		});
		const ordinaryUpdate = config.toUpdateVars({
			title: task.title,
			description: task.description,
			priority: task.priority,
			columnId: column.id,
			assigneeId: "",
		});

		expect(move).toEqual({
			id: task.id,
			data: expect.objectContaining({
				columnId: targetColumn.id,
				order: 5,
			}),
		});
		expect(ordinaryUpdate.data).not.toHaveProperty("columnId");
		expect(ordinaryUpdate.data).not.toHaveProperty("order");
	});
});

describe("Kanban i18n precedence", () => {
	it("routes UI strings through the i18n provider", async () => {
		const i18n: StackI18nProvider = {
			translate: (key, defaultValue) =>
				key === "kanban.common.noBoards" ? "Noch keine Boards" : defaultValue,
		};

		await render(<BoardsListPage />, { i18n });
		expect(texts()).toContain("Noch keine Boards");
	});

	it("lets the existing localization override win", async () => {
		const translate = vi.fn((key: string) => `translated:${key}`);

		await render(<BoardsListPage />, {
			i18n: { translate },
			localization: { noBoards: "Custom empty board copy" },
		});

		expect(texts()).toContain("Custom empty board copy");
		expect(texts()).not.toContain("translated:kanban.common.noBoards");
	});
});
