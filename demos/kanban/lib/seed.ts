import {
	findOrCreateKanbanBoard,
	getKanbanColumnsByBoardId,
	createKanbanTask,
} from "@btst/stack/plugins/kanban/api";
import type { Adapter } from "@btst/stack/plugins/api";

let seeded = false;

export async function seedKanbanData(adapter: Adapter) {
	if (seeded) return;
	seeded = true;

	try {
		const board = await findOrCreateKanbanBoard(
			adapter,
			"demo-board",
			"BTST Demo Board",
			["To Do", "In Progress", "In Review", "Done"],
		);

		const columns = await getKanbanColumnsByBoardId(adapter, board.id);
		if (!columns || columns.length === 0) return;

		const todoCol = columns.find((c) => c.title === "To Do");
		const inProgressCol = columns.find((c) => c.title === "In Progress");
		const doneCol = columns.find((c) => c.title === "Done");

		if (!todoCol || !inProgressCol || !doneCol) return;

		// Only seed tasks if the board is fresh (no tasks yet)
		const existingTasks = await adapter.findMany({
			model: "kanbanTask",
			where: [
				{ field: "columnId", value: todoCol.id, operator: "eq" as const },
			],
			limit: 1,
		});
		if (existingTasks.length > 0) return;

		await createKanbanTask(adapter, {
			title: "Set up the BTST stack",
			columnId: doneCol.id,
			description: "Install @btst/stack and configure the adapter",
			priority: "HIGH",
		});

		await createKanbanTask(adapter, {
			title: "Add the Kanban plugin",
			columnId: doneCol.id,
			description: "Register kanbanBackendPlugin and kanbanClientPlugin",
			priority: "HIGH",
		});

		await createKanbanTask(adapter, {
			title: "Configure custom columns",
			columnId: inProgressCol.id,
			description: "Customize the board columns to fit the team workflow",
			priority: "MEDIUM",
		});

		await createKanbanTask(adapter, {
			title: "Invite team members",
			columnId: inProgressCol.id,
			description: "Add colleagues to the demo board",
			priority: "LOW",
		});

		await createKanbanTask(adapter, {
			title: "Connect to a real database",
			columnId: todoCol.id,
			description:
				"Replace the in-memory adapter with Prisma, Drizzle, or another supported ORM",
			priority: "MEDIUM",
		});

		await createKanbanTask(adapter, {
			title: "Add authentication",
			columnId: todoCol.id,
			description: "Protect the kanban routes with your auth solution",
			priority: "HIGH",
		});

		await createKanbanTask(adapter, {
			title: "Deploy to production",
			columnId: todoCol.id,
			description:
				"Deploy the app to Vercel, Fly.io, or your preferred hosting",
			priority: "URGENT",
		});

		console.log(
			"[demo] Kanban seed complete — 1 board, 4 columns, 7 tasks created",
		);
	} catch (err) {
		console.error("[demo] Kanban seed failed:", err);
	}
}
