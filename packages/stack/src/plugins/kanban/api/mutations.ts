import type { Adapter } from "@btst/db";
import type { Board, Column, Task, Priority } from "../types";

/**
 * Input for creating a new Kanban task.
 */
export interface CreateKanbanTaskInput {
	title: string;
	columnId: string;
	description?: string;
	priority?: Priority;
	assigneeId?: string;
}

/**
 * Create a new task in a Kanban column.
 * Computes the next order value from existing tasks in the column.
 *
 * @remarks **Security:** No authorization hooks (onBeforeCreateTask) are called.
 * The caller is responsible for any access-control checks before invoking this
 * function.
 *
 * @param adapter - The database adapter
 * @param input - Task creation input
 */
export async function createKanbanTask(
	adapter: Adapter,
	input: CreateKanbanTaskInput,
): Promise<Task> {
	const existingTasks = await adapter.findMany<Task>({
		model: "kanbanTask",
		where: [
			{
				field: "columnId",
				value: input.columnId,
				operator: "eq" as const,
			},
		],
	});

	const nextOrder =
		existingTasks.length > 0
			? Math.max(...existingTasks.map((t) => t.order)) + 1
			: 0;

	return adapter.create<Task>({
		model: "kanbanTask",
		data: {
			title: input.title,
			columnId: input.columnId,
			description: input.description,
			priority: input.priority ?? "MEDIUM",
			order: nextOrder,
			assigneeId: input.assigneeId,
			isArchived: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

/**
 * Find a board by slug, or create it with the given name and custom column titles.
 * Safe to call concurrently — uses a find-first pattern before creating.
 *
 * @remarks **Security:** No authorization hooks are called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param slug - Unique URL-safe slug for the board
 * @param name - Display name for the board (used only on creation)
 * @param columnTitles - Ordered list of column names to create (used only on creation)
 */
export async function findOrCreateKanbanBoard(
	adapter: Adapter,
	slug: string,
	name: string,
	columnTitles: string[],
): Promise<Board> {
	const existing = await adapter.findOne<Board>({
		model: "kanbanBoard",
		where: [{ field: "slug", value: slug, operator: "eq" as const }],
	});

	if (existing) return existing;

	const board = await adapter.create<Board>({
		model: "kanbanBoard",
		data: {
			name,
			slug,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});

	await Promise.all(
		columnTitles.map((title, index) =>
			adapter.create<Column>({
				model: "kanbanColumn",
				data: {
					title,
					boardId: board.id,
					order: index,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		),
	);

	return board;
}

/**
 * Retrieve all columns for a given board, sorted by order.
 * Co-located with mutations because it is primarily used alongside
 * {@link createKanbanTask} to resolve column IDs before task creation.
 *
 * @remarks **Security:** No authorization hooks are called.
 *
 * @param adapter - The database adapter
 * @param boardId - The board ID
 */
export async function getKanbanColumnsByBoardId(
	adapter: Adapter,
	boardId: string,
): Promise<Column[]> {
	return adapter.findMany<Column>({
		model: "kanbanColumn",
		where: [{ field: "boardId", value: boardId, operator: "eq" as const }],
		sortBy: { field: "order", direction: "asc" },
	});
}
