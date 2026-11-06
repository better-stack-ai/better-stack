import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { kanbanClientPlugin } from "../client/plugin";
import type { KanbanPluginOverrides } from "../client/overrides";
import {
	TaskDetails,
	type TaskDetailsProps,
} from "../client/components/shared/task-details";

const props: TaskDetailsProps = {
	task: {
		id: "task-1",
		title: "Ship release",
		assigneeId: null,
		createdAt: "2026-11-06T12:00:00.000Z",
	} as TaskDetailsProps["task"],
	assignee: null,
	assignedLabel: "Assigned",
	unassignedLabel: "Unassigned",
};
const pages = ["board"] as const;
function render(
	view: ReactElement,
	pageOverrides?: KanbanPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ kanban: kanbanClientPlugin() })}
			overrides={{
				kanban: {
					...{ resolveUser: () => null, searchUsers: () => [] },
					pageOverrides,
				},
			}}
		>
			{view}
		</StackProvider>,
	);
}

describe("kanban page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: KanbanPluginOverrides["pageOverrides"] = {
			board: {
				TaskDetails: (props) => (
					<article data-slot-name="board">
						{String(Boolean(props.task))}
					</article>
				),
			},
		};
		for (const page of pages) {
			const html = render(
				<TaskDetails page={page} {...props} />,
				pageOverrides,
			);
			expect(html).toContain(`data-slot-name="${page}">true`);
			for (const other of pages.filter((candidate) => candidate !== page))
				expect(html).not.toContain(`data-slot-name="${other}"`);
		}
		expect(render(<TaskDetails {...props} />, pageOverrides)).toContain(
			"Unassigned",
		);
		expect(render(<TaskDetails {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<TaskDetails page={page} {...props} />)).toContain(
				"Unassigned",
			);
			expect(
				render(<TaskDetails page={page} {...props} />, { [page]: {} }),
			).toContain("Unassigned");
		}
	});
});

import { BoardPage } from "../client/components/pages/board-page.internal";
vi.mock("../client/hooks/kanban-hooks", () => ({
	useSuspenseBoard: () => ({
		data: {
			id: "board-1",
			name: "Roadmap",
			columns: [
				{
					id: "column-1",
					title: "Todo",
					order: 0,
					tasks: [
						{
							id: "task-1",
							title: "Ship release",
							priority: "MEDIUM",
							createdAt: "2026-11-06",
							isArchived: false,
						},
					],
				},
			],
		},
	}),
	useBoardMutations: () => ({}),
	useColumnMutations: () => ({}),
	useTaskMutations: () => ({}),
	useResolveUser: () => ({ data: null }),
}));
it("supplies board scope through the board, column and gated task card", () => {
	expect(
		render(<BoardPage boardId="board-1" />, {
			board: {
				TaskDetails: ({ task }) => <span data-page="board">{task.title}</span>,
			},
		}),
	).toContain('data-page="board">Ship release');
});
