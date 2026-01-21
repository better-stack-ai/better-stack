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
	assigneeId?: string;
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
