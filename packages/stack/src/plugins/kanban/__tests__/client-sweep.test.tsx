// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { BoardForm } from "../client/components/forms/board-form";
import { ColumnForm } from "../client/components/forms/column-form";
import { TaskForm } from "../client/components/forms/task-form";
import { BoardsListPage } from "../client/components/pages/boards-list-page.internal";
import type {
	SerializedBoard,
	SerializedColumn,
	SerializedTask,
} from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hooks = vi.hoisted(() => ({
	useSuspenseBoards: vi.fn(),
	useBoardForm: vi.fn(),
	useColumnForm: vi.fn(),
	useTaskForm: vi.fn(),
	useTaskMutations: vi.fn(),
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
	navigate: vi.fn(),
	apiBaseURL: "http://test.local",
	apiBasePath: "/api/data",
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
	hooks.useBoardForm.mockReturnValue({ ...formResult });
	hooks.useColumnForm.mockReturnValue({ ...formResult });
	hooks.useTaskForm.mockReturnValue({ ...formResult });
	hooks.useTaskMutations.mockReturnValue({
		moveTask: vi.fn().mockResolvedValue(task),
		isMoving: false,
	});
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
		i18n?: StackI18nProvider;
		localization?: Record<string, string>;
	} = {},
) {
	await act(async () => {
		root.render(
			<StackProvider
				basePath="/pages"
				auth={options.auth}
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

describe("Kanban permissions", () => {
	it("shows create-board controls when auth is not configured", async () => {
		await render(<BoardsListPage />);
		expect(texts()).toContain("Create Board");
	});

	it("hides create-board controls when permission is denied", async () => {
		const can = vi.fn(
			({ resource, action }: { resource: string; action: string }) =>
				!(resource === "kanban:board" && action === "create"),
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "user-1" }),
			can,
		};

		await render(<BoardsListPage />, { auth });
		await waitFor(() => !texts().includes("Create Board"));

		expect(texts()).toContain("No boards yet");
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "kanban:board",
				action: "create",
			}),
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
