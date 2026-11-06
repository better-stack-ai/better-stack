// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BoardPage } from "../client/components/pages/board-page.internal";
const state = vi.hoisted(() => ({
	context: null as any,
	create: vi.fn(),
	identity: "owner",
	board: {
		id: "b1",
		name: "Board",
		columns: [{ id: "c1", title: "Todo", tasks: [] }],
	},
}));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	useNotify: () => ({ error: vi.fn(), success: vi.fn() }),
	useTranslate: () => (_: string, fallback: string) => fallback,
	useIdentity: () => ({ identity: { id: state.identity } }),
	useStack: () => ({}),
	usePluginOverrides: () => ({}),
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: () => ({ href: "/" }),
		navigate: vi.fn(),
	}),
}));
vi.mock("../client/hooks/kanban-hooks", () => ({
	useSuspenseBoard: () => ({ data: state.board }),
	useTaskMutations: () => ({ createTask: state.create }),
	useBoardMutations: () => ({}),
	useColumnMutations: () => ({}),
}));
vi.mock("../client/components/shared/kanban-board", () => ({
	KanbanBoard: () => <div>Board canvas</div>,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
	vi.clearAllMocks();
	state.identity = "owner";
});
it("validates the current board column before calling the existing task mutation", async () => {
	state.create.mockResolvedValue({ id: "t1" });
	await act(async () => root.render(<BoardPage boardId="b1" />));
	expect(
		await state.context.clientTools.createKanbanTasks({
			columnId: "outside",
			tasks: [{ title: "No" }],
		}),
	).toMatchObject({ success: false });
	expect(state.create).not.toHaveBeenCalled();
	expect(
		await state.context.clientTools.createKanbanTasks({
			columnId: "c1",
			tasks: [{ title: "One" }, { title: "Two", priority: "HIGH" }],
		}),
	).toMatchObject({ success: true });
	expect(state.create.mock.calls.map(([input]) => input)).toEqual([
		{ title: "One", columnId: "c1" },
		{ title: "Two", priority: "HIGH", columnId: "c1" },
	]);
});
it("stops the remaining requests after identity changes while a create is in flight", async () => {
	let finish!: () => void;
	state.create.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	await act(async () => root.render(<BoardPage boardId="b1" />));
	const pending = state.context.clientTools.createKanbanTasks({
		columnId: "c1",
		tasks: [{ title: "One" }, { title: "Two" }],
	});
	state.identity = "another-owner";
	await act(async () => root.render(<BoardPage boardId="b1" />));
	finish();
	expect(await pending).toMatchObject({ success: false });
	expect(state.create).toHaveBeenCalledTimes(1);
});
