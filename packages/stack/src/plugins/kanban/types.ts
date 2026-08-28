import type { PermissionFactsFor } from "@btst/stack/authorization";
import type { StackIdentity } from "@btst/stack/context";
import type { DeepReadonly } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type { kanbanPermissions } from "./permissions";
import type {
	BoardListQuerySchema,
	createBoardSchema,
	createColumnSchema,
	createTaskSchema,
	moveTaskSchema,
	reorderColumnsSchema,
	reorderTasksSchema,
	updateBoardSchema,
	updateColumnSchema,
	updateTaskSchema,
} from "./schemas";

/**
 * Priority levels for tasks
 */
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/**
 * Kanban Board
 */
export type Board = {
	id: string;
	name: string;
	slug: string;
	description?: string;
	ownerId?: string;
	organizationId?: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Kanban Column
 */
export type Column = {
	id: string;
	title: string;
	order: number;
	boardId: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Kanban Task
 */
export type Task = {
	id: string;
	title: string;
	description?: string;
	priority: Priority;
	order: number;
	columnId: string;
	assigneeId?: string | null;
	completedAt?: Date;
	isArchived: boolean;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Column with its tasks
 */
export type ColumnWithTasks = Column & {
	tasks: Task[];
};

/**
 * Board with columns and tasks
 */
export type BoardWithColumns = Board & {
	columns: ColumnWithTasks[];
};

/**
 * Board with joined column relationships from the database
 * Note: The adapter returns joined data under the schema key name ("column"),
 * not the model name ("kanbanColumn")
 */
export type BoardWithKanbanColumn = Board & {
	column?: Column[];
};

/**
 * Column with joined task relationships from the database
 * Note: The adapter returns joined data under the schema key name ("task"),
 * not the model name ("kanbanTask")
 */
export type ColumnWithKanbanTask = Column & {
	task?: Task[];
};

// Serialized types for API responses (dates as strings)

export interface SerializedTask
	extends Omit<Task, "createdAt" | "updatedAt" | "completedAt"> {
	completedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface SerializedColumn
	extends Omit<Column, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
	tasks?: SerializedTask[];
}

export interface SerializedBoard
	extends Omit<Board, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
	columns?: SerializedColumn[];
}

export interface SerializedBoardWithColumns extends SerializedBoard {
	columns: SerializedColumn[];
}

/** Board summary returned by the collection operation (task rows are omitted). */
export interface SerializedBoardSummary
	extends Omit<SerializedBoard, "columns"> {
	columns: ReadonlyArray<Omit<SerializedColumn, "tasks">>;
}

/** Typed, immutable context passed to Kanban lifecycle hooks after authorization. */
export interface KanbanApiContext<TInput = unknown, TFacts = unknown> {
	readonly input: DeepReadonly<TInput>;
	readonly facts: DeepReadonly<TFacts>;
	readonly identity: DeepReadonly<StackIdentity> | null;
	readonly request?: Request;
	readonly headers?: Headers;
	/** @deprecated Read validated values from `input`. */
	readonly body?: unknown;
	/** @deprecated Read validated values from `input`. */
	readonly params?: unknown;
	/** @deprecated Read validated values from `input`. */
	readonly query?: unknown;
}

/** Lifecycle context for an operation that completed successfully. */
export interface KanbanApiResultContext<
	TInput = unknown,
	TFacts = unknown,
	TResult = unknown,
> extends KanbanApiContext<TInput, TFacts> {
	readonly result: DeepReadonly<TResult>;
}

type BoardReadFacts = PermissionFactsFor<typeof kanbanPermissions.board.read>;
type BoardCreateFacts = PermissionFactsFor<
	typeof kanbanPermissions.board.create
>;
type BoardUpdateFacts = PermissionFactsFor<
	typeof kanbanPermissions.board.update
>;
type BoardDeleteFacts = PermissionFactsFor<
	typeof kanbanPermissions.board.delete
>;
type ColumnCreateFacts = PermissionFactsFor<
	typeof kanbanPermissions.column.create
>;
type ColumnUpdateFacts = PermissionFactsFor<
	typeof kanbanPermissions.column.update
>;
type ColumnDeleteFacts = PermissionFactsFor<
	typeof kanbanPermissions.column.delete
>;
type ColumnReorderFacts = PermissionFactsFor<
	typeof kanbanPermissions.column.reorder
>;
type TaskCreateFacts = PermissionFactsFor<typeof kanbanPermissions.task.create>;
type TaskUpdateFacts = PermissionFactsFor<typeof kanbanPermissions.task.update>;
type TaskDeleteFacts = PermissionFactsFor<typeof kanbanPermissions.task.delete>;
type TaskMoveFacts = PermissionFactsFor<typeof kanbanPermissions.task.move>;
type TaskReorderFacts = PermissionFactsFor<
	typeof kanbanPermissions.task.reorder
>;

type UpdateBoardInput = {
	id: string;
	data: Omit<z.output<typeof updateBoardSchema>, "id">;
};
type UpdateColumnInput = {
	id: string;
	data: Omit<z.output<typeof updateColumnSchema>, "id">;
};
type UpdateTaskInput = {
	id: string;
	data: Omit<z.output<typeof updateTaskSchema>, "id">;
};

/** Context for the board collection operation. */
export type BoardListOperationContext = KanbanApiContext<
	z.output<typeof BoardListQuerySchema>,
	BoardReadFacts
>;
/** Successful result context for the board collection operation. */
export type BoardListOperationResultContext = KanbanApiResultContext<
	z.output<typeof BoardListQuerySchema>,
	BoardReadFacts,
	{
		items: readonly SerializedBoardSummary[];
		total: number;
		limit?: number;
		offset?: number;
	}
>;
/** Context for reading one board. */
export type BoardReadOperationContext = KanbanApiContext<
	{ id: string },
	BoardReadFacts
>;
/** Successful result context for reading one board. */
export type BoardReadOperationResultContext = KanbanApiResultContext<
	{ id: string },
	BoardReadFacts,
	SerializedBoardWithColumns
>;
/** Context for creating one board. */
export type BoardCreateOperationContext = KanbanApiContext<
	z.output<typeof createBoardSchema>,
	BoardCreateFacts
>;
/** Successful result context for creating one board. */
export type BoardCreateOperationResultContext = KanbanApiResultContext<
	z.output<typeof createBoardSchema>,
	BoardCreateFacts,
	SerializedBoardWithColumns
>;
/** Context for updating one board. */
export type BoardUpdateOperationContext = KanbanApiContext<
	UpdateBoardInput,
	BoardUpdateFacts
>;
/** Successful result context for updating one board. */
export type BoardUpdateOperationResultContext = KanbanApiResultContext<
	UpdateBoardInput,
	BoardUpdateFacts,
	SerializedBoard
>;
/** Context for deleting one board. */
export type BoardDeleteOperationContext = KanbanApiContext<
	{ id: string },
	BoardDeleteFacts
>;
/** Successful result context for deleting one board. */
export type BoardDeleteOperationResultContext = KanbanApiResultContext<
	{ id: string },
	BoardDeleteFacts,
	{ success: true }
>;
/** Context for creating one column. */
export type ColumnCreateOperationContext = KanbanApiContext<
	z.output<typeof createColumnSchema>,
	ColumnCreateFacts
>;
/** Successful result context for creating one column. */
export type ColumnCreateOperationResultContext = KanbanApiResultContext<
	z.output<typeof createColumnSchema>,
	ColumnCreateFacts,
	SerializedColumn
>;
/** Context for updating one column. */
export type ColumnUpdateOperationContext = KanbanApiContext<
	UpdateColumnInput,
	ColumnUpdateFacts
>;
/** Successful result context for updating one column. */
export type ColumnUpdateOperationResultContext = KanbanApiResultContext<
	UpdateColumnInput,
	ColumnUpdateFacts,
	SerializedColumn
>;
/** Context for deleting one column. */
export type ColumnDeleteOperationContext = KanbanApiContext<
	{ id: string },
	ColumnDeleteFacts
>;
/** Successful result context for deleting one column. */
export type ColumnDeleteOperationResultContext = KanbanApiResultContext<
	{ id: string },
	ColumnDeleteFacts,
	{ success: true }
>;
/** Context for reordering a board's columns. */
export type ColumnReorderOperationContext = KanbanApiContext<
	z.output<typeof reorderColumnsSchema>,
	ColumnReorderFacts
>;
/** Successful result context for reordering a board's columns. */
export type ColumnReorderOperationResultContext = KanbanApiResultContext<
	z.output<typeof reorderColumnsSchema>,
	ColumnReorderFacts,
	{ success: true }
>;
/** Context for creating one task. */
export type TaskCreateOperationContext = KanbanApiContext<
	z.output<typeof createTaskSchema>,
	TaskCreateFacts
>;
/** Successful result context for creating one task. */
export type TaskCreateOperationResultContext = KanbanApiResultContext<
	z.output<typeof createTaskSchema>,
	TaskCreateFacts,
	SerializedTask
>;
/** Context for updating one task. */
export type TaskUpdateOperationContext = KanbanApiContext<
	UpdateTaskInput,
	TaskUpdateFacts
>;
/** Successful result context for updating one task. */
export type TaskUpdateOperationResultContext = KanbanApiResultContext<
	UpdateTaskInput,
	TaskUpdateFacts,
	SerializedTask
>;
/** Context for deleting one task. */
export type TaskDeleteOperationContext = KanbanApiContext<
	{ id: string },
	TaskDeleteFacts
>;
/** Successful result context for deleting one task. */
export type TaskDeleteOperationResultContext = KanbanApiResultContext<
	{ id: string },
	TaskDeleteFacts,
	{ success: true }
>;
/** Context for moving one task. */
export type TaskMoveOperationContext = KanbanApiContext<
	z.output<typeof moveTaskSchema>,
	TaskMoveFacts
>;
/** Successful result context for moving one task. */
export type TaskMoveOperationResultContext = KanbanApiResultContext<
	z.output<typeof moveTaskSchema>,
	TaskMoveFacts,
	SerializedTask
>;
/** Context for reordering a column's tasks. */
export type TaskReorderOperationContext = KanbanApiContext<
	z.output<typeof reorderTasksSchema>,
	TaskReorderFacts
>;
/** Successful result context for reordering a column's tasks. */
export type TaskReorderOperationResultContext = KanbanApiResultContext<
	z.output<typeof reorderTasksSchema>,
	TaskReorderFacts,
	{ success: true }
>;

/** Configuration hooks for Kanban. Authorization always runs before these hooks. */
export interface KanbanBackendHooks {
	onBeforeListBoards?: (
		filter: z.output<typeof BoardListQuerySchema>,
		context: BoardListOperationContext,
	) => Promise<void> | void;
	onBeforeCreateBoard?: (
		data: z.output<typeof createBoardSchema>,
		context: BoardCreateOperationContext,
	) => Promise<void> | void;
	onBeforeReadBoard?: (
		boardId: string,
		context: BoardReadOperationContext,
	) => Promise<void> | void;
	onBeforeUpdateBoard?: (
		boardId: string,
		data: z.output<typeof updateBoardSchema>,
		context: BoardUpdateOperationContext,
	) => Promise<void> | void;
	onBeforeDeleteBoard?: (
		boardId: string,
		context: BoardDeleteOperationContext,
	) => Promise<void> | void;
	onBoardsRead?: (
		boards: readonly DeepReadonly<SerializedBoardSummary>[],
		filter: z.output<typeof BoardListQuerySchema>,
		context: BoardListOperationResultContext,
	) => Promise<void> | void;
	onBoardRead?: (
		board: DeepReadonly<SerializedBoardWithColumns>,
		context: BoardReadOperationResultContext,
	) => Promise<void> | void;
	onBoardCreated?: (
		board: DeepReadonly<SerializedBoardWithColumns>,
		context: BoardCreateOperationResultContext,
	) => Promise<void> | void;
	onBoardUpdated?: (
		board: DeepReadonly<SerializedBoard>,
		context: BoardUpdateOperationResultContext,
	) => Promise<void> | void;
	onBoardDeleted?: (
		boardId: string,
		context: BoardDeleteOperationResultContext,
	) => Promise<void> | void;
	onListBoardsError?: (
		error: Error,
		context: BoardListOperationContext,
	) => Promise<void> | void;
	onReadBoardError?: (
		error: Error,
		context: BoardReadOperationContext,
	) => Promise<void> | void;
	onCreateBoardError?: (
		error: Error,
		context: BoardCreateOperationContext,
	) => Promise<void> | void;
	onUpdateBoardError?: (
		error: Error,
		context: BoardUpdateOperationContext,
	) => Promise<void> | void;
	onDeleteBoardError?: (
		error: Error,
		context: BoardDeleteOperationContext,
	) => Promise<void> | void;
	onBeforeCreateColumn?: (
		data: z.output<typeof createColumnSchema>,
		context: ColumnCreateOperationContext,
	) => Promise<void> | void;
	onBeforeUpdateColumn?: (
		columnId: string,
		data: z.output<typeof updateColumnSchema>,
		context: ColumnUpdateOperationContext | ColumnReorderOperationContext,
	) => Promise<void> | void;
	onBeforeDeleteColumn?: (
		columnId: string,
		context: ColumnDeleteOperationContext,
	) => Promise<void> | void;
	onColumnCreated?: (
		column: DeepReadonly<SerializedColumn>,
		context: ColumnCreateOperationResultContext,
	) => Promise<void> | void;
	onColumnUpdated?: (
		column: DeepReadonly<SerializedColumn>,
		context:
			| ColumnUpdateOperationResultContext
			| ColumnReorderOperationResultContext,
	) => Promise<void> | void;
	onColumnDeleted?: (
		columnId: string,
		context: ColumnDeleteOperationResultContext,
	) => Promise<void> | void;
	onBeforeCreateTask?: (
		data: z.output<typeof createTaskSchema>,
		context: TaskCreateOperationContext,
	) => Promise<void> | void;
	onBeforeUpdateTask?: (
		taskId: string,
		data: z.output<typeof updateTaskSchema>,
		context:
			| TaskUpdateOperationContext
			| TaskMoveOperationContext
			| TaskReorderOperationContext,
	) => Promise<void> | void;
	onBeforeDeleteTask?: (
		taskId: string,
		context: TaskDeleteOperationContext,
	) => Promise<void> | void;
	onTaskCreated?: (
		task: DeepReadonly<SerializedTask>,
		context: TaskCreateOperationResultContext,
	) => Promise<void> | void;
	onTaskUpdated?: (
		task: DeepReadonly<SerializedTask>,
		context:
			| TaskUpdateOperationResultContext
			| TaskMoveOperationResultContext
			| TaskReorderOperationResultContext,
	) => Promise<void> | void;
	onTaskDeleted?: (
		taskId: string,
		context: TaskDeleteOperationResultContext,
	) => Promise<void> | void;
}
