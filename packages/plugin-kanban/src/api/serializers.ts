import type {
	Task,
	ColumnWithTasks,
	BoardWithColumns,
	BoardWithColumnsOnly,
	SerializedTask,
	SerializedColumn,
	SerializedBoardSummary,
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

/** Serialize a collection-safe board summary without task rows. */
export function serializeBoardSummary(board: BoardWithColumnsOnly) {
	return {
		id: board.id,
		name: board.name,
		slug: board.slug,
		description: board.description,
		ownerId: board.ownerId,
		organizationId: board.organizationId,
		createdAt: board.createdAt.toISOString(),
		updatedAt: board.updatedAt.toISOString(),
		columns: board.columns.map((column) => {
			const { tasks: _tasks, ...bareColumn } = column as typeof column & {
				tasks?: unknown;
			};
			return {
				...bareColumn,
				createdAt: column.createdAt.toISOString(),
				updatedAt: column.updatedAt.toISOString(),
			};
		}),
	} satisfies SerializedBoardSummary;
}
