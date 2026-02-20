import type { Adapter } from "@btst/db";
import type {
	BoardWithKanbanColumn,
	BoardWithColumns,
	ColumnWithTasks,
	Task,
} from "../types";
import type { z } from "zod";
import type { BoardListQuerySchema } from "../schemas";

/**
 * Paginated result returned by {@link getAllBoards}.
 */
export interface BoardListResult {
	items: BoardWithColumns[];
	total: number;
	limit?: number;
	offset?: number;
}

/**
 * Given a raw board record (with a `column` join), fetches tasks for every
 * column in parallel and returns the sorted columns with their tasks attached.
 * Strips the raw `column` join field from the returned board object.
 */
async function hydrateColumnsWithTasks(
	adapter: Adapter,
	board: BoardWithKanbanColumn,
): Promise<BoardWithColumns> {
	const columnIds = (board.column || []).map((c) => c.id);
	const tasksByColumn = new Map<string, Task[]>();

	if (columnIds.length > 0) {
		const taskResults = await Promise.all(
			columnIds.map((columnId) =>
				adapter.findMany<Task>({
					model: "kanbanTask",
					where: [
						{ field: "columnId", value: columnId, operator: "eq" as const },
					],
					sortBy: { field: "order", direction: "asc" },
				}),
			),
		);
		for (let i = 0; i < columnIds.length; i++) {
			const columnId = columnIds[i];
			const tasks = taskResults[i];
			if (columnId && tasks) {
				tasksByColumn.set(columnId, tasks);
			}
		}
	}

	const columns: ColumnWithTasks[] = (board.column || [])
		.sort((a, b) => a.order - b.order)
		.map((col) => ({ ...col, tasks: tasksByColumn.get(col.id) || [] }));

	const { column: _, ...boardWithoutJoin } = board;
	return { ...boardWithoutJoin, columns };
}

/**
 * Retrieve all boards matching optional filter criteria, with columns and tasks.
 * Pure DB function - no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters (same shape as the list API query)
 */
export async function getAllBoards(
	adapter: Adapter,
	params?: z.infer<typeof BoardListQuerySchema>,
): Promise<BoardListResult> {
	const query = params ?? {};

	const whereConditions: Array<{
		field: string;
		value: string;
		operator: "eq";
	}> = [];

	if (query.slug) {
		whereConditions.push({
			field: "slug",
			value: query.slug,
			operator: "eq" as const,
		});
	}

	if (query.ownerId) {
		whereConditions.push({
			field: "ownerId",
			value: query.ownerId,
			operator: "eq" as const,
		});
	}

	if (query.organizationId) {
		whereConditions.push({
			field: "organizationId",
			value: query.organizationId,
			operator: "eq" as const,
		});
	}

	const where = whereConditions.length > 0 ? whereConditions : undefined;

	const [boards, total] = await Promise.all([
		adapter.findMany<BoardWithKanbanColumn>({
			model: "kanbanBoard",
			limit: query.limit ?? 50,
			offset: query.offset ?? 0,
			where,
			sortBy: { field: "createdAt", direction: "desc" },
			join: { kanbanColumn: true },
		}),
		adapter.count({ model: "kanbanBoard", where }),
	]);

	const items = await Promise.all(
		boards.map((board) => hydrateColumnsWithTasks(adapter, board)),
	);

	return { items, total, limit: query.limit, offset: query.offset };
}

/**
 * Retrieve a single board by its ID, with all columns and tasks.
 * Returns null if the board is not found.
 * Pure DB function - no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @param adapter - The database adapter
 * @param id - The board ID
 */
export async function getBoardById(
	adapter: Adapter,
	id: string,
): Promise<BoardWithColumns | null> {
	const board = await adapter.findOne<BoardWithKanbanColumn>({
		model: "kanbanBoard",
		where: [{ field: "id", value: id, operator: "eq" as const }],
		join: { kanbanColumn: true },
	});

	if (!board) {
		return null;
	}

	return hydrateColumnsWithTasks(adapter, board);
}
