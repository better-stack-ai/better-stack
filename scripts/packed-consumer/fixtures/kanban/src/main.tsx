import { kanbanClientPlugin } from "@btst/plugin-kanban/client";
import { KanbanBoard } from "@btst/plugin-kanban/client/components";
import type { SerializedTask } from "@btst/plugin-kanban/types";
import "@btst/plugin-kanban/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";

const queryClient = new QueryClient();
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api/data" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { kanban: kanbanClientPlugin() },
});

const task: SerializedTask = {
	id: "task-1",
	title: "Packed task",
	columnId: "column-1",
	priority: "MEDIUM",
	order: 0,
	isArchived: false,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};
const columns = [
	{
		id: "column-1",
		title: "Packed column",
		boardId: "board-1",
		order: 0,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		tasks: [task],
	},
];
function Board() {
	const [state, setState] = useState<Record<string, SerializedTask[]>>({
		"column-1": [task],
	});
	return (
		<KanbanBoard
			boardId="board-1"
			columns={columns}
			kanbanState={state}
			onKanbanChange={setState}
			onAddTask={() => undefined}
			onEditTask={() => undefined}
			onEditColumn={() => undefined}
			onDeleteColumn={() => undefined}
		/>
	);
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			overrides={{
				kanban: {
					uploadImage: async () => "",
					resolveUser: async () => null,
					searchUsers: async () => [],
				},
			}}
		>
			<Board />
		</StackProvider>
	</QueryClientProvider>,
);
