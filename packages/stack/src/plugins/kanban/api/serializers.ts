import type {
	Task,
	ColumnWithTasks,
	BoardWithColumns,
	SerializedTask,
	SerializedColumn,
	SerializedBoardWithColumns,
} from "../types";

/**
 * Serialize a Task for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeTask(task: Task): SerializedTask {
	return {
		...task,
		completedAt: task.completedAt?.toISOString(),
		createdAt: task.createdAt.toISOString(),
		updatedAt: task.updatedAt.toISOString(),
	};
}

/**
 * Serialize a Column (with its tasks) for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeColumn(col: ColumnWithTasks): SerializedColumn {
	return {
		...col,
		createdAt: col.createdAt.toISOString(),
		updatedAt: col.updatedAt.toISOString(),
		tasks: col.tasks.map(serializeTask),
	};
}

/**
 * Serialize a Board (with columns and tasks) for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeBoard(
	board: BoardWithColumns,
): SerializedBoardWithColumns {
	return {
		...board,
		createdAt: board.createdAt.toISOString(),
		updatedAt: board.updatedAt.toISOString(),
		columns: board.columns.map(serializeColumn),
	};
}
