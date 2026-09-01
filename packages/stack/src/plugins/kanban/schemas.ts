import { z } from "zod";

/**
 * Priority enum schema
 */
export const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

// ============ Board Schemas ============

const boardDateFields = {
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
};

const boardCoreFields = {
	name: z.string().min(1, "Name is required"),
	slug: z.string().min(1, "Slug is required"),
	description: z.string().optional(),
	ownerId: z.string().optional(),
	organizationId: z.string().optional(),
};

const boardOperationFields = {
	name: boardCoreFields.name,
	slug: boardCoreFields.slug,
	description: boardCoreFields.description,
};

export const BoardDomainSchema = z.object({
	id: z.string().optional(),
	...boardCoreFields,
	...boardDateFields,
});

/** Browser-safe board create input. Ownership and timestamps are server-owned. */
export const createBoardSchema = z.object({
	...boardOperationFields,
	slug: boardOperationFields.slug.optional(),
});

/** Browser-safe board update input. Ownership and timestamps are server-owned. */
export const updateBoardSchema = z
	.object({ id: z.string(), ...boardOperationFields })
	.partial()
	.required({ id: true });

// ============ Column Schemas ============

const columnDateFields = {
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
};

const columnCoreFields = {
	title: z.string().min(1, "Title is required"),
	order: z.number().int().min(0).optional(),
	boardId: z.string().min(1, "Board ID is required"),
};

export const ColumnDomainSchema = z.object({
	id: z.string().optional(),
	...columnCoreFields,
	order: columnCoreFields.order.default(0),
	...columnDateFields,
});

/** Browser-safe column create input. Server-owned timestamps are not accepted. */
export const createColumnSchema = z.object(columnCoreFields);

/** Browser-safe column update input. Server-owned timestamps are not accepted. */
export const updateColumnSchema = z
	.object({ id: z.string(), ...columnCoreFields })
	.partial()
	.required({ id: true });

// ============ Task Schemas ============

const taskDateFields = {
	completedAt: z.coerce.date().optional(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
};

const taskOperationCompletedAt = z
	.union([z.iso.datetime(), z.date()])
	.transform((value) => (value instanceof Date ? value.toISOString() : value))
	.optional();

const taskCoreFields = {
	title: z.string().min(1, "Title is required"),
	description: z.string().optional(),
	priority: PrioritySchema.optional(),
	order: z.number().int().min(0).optional(),
	columnId: z.string().min(1, "Column ID is required"),
	assigneeId: z.string().optional().nullable(),
	isArchived: z.boolean().optional(),
};

export const TaskDomainSchema = z.object({
	id: z.string().optional(),
	...taskCoreFields,
	priority: taskCoreFields.priority.default("MEDIUM"),
	order: taskCoreFields.order.default(0),
	isArchived: taskCoreFields.isArchived.default(false),
	...taskDateFields,
});

/** Browser-safe task create input. Dates cross the boundary as ISO strings. */
export const createTaskSchema = z.object({
	...taskCoreFields,
	completedAt: taskOperationCompletedAt,
});

/** Browser-safe task update input. Dates cross the boundary as ISO strings. */
export const updateTaskSchema = z
	.object({
		id: z.string(),
		...taskCoreFields,
		completedAt: taskOperationCompletedAt,
	})
	.partial()
	.required({ id: true });

// ============ Query Schemas ============

export const BoardListQuerySchema = z.object({
	slug: z.string().optional(),
	ownerId: z.string().optional(),
	organizationId: z.string().optional(),
	offset: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const ColumnListQuerySchema = z.object({
	boardId: z.string().optional(),
});

export const TaskListQuerySchema = z.object({
	columnId: z.string().optional(),
	assigneeId: z.string().optional(),
	priority: PrioritySchema.optional(),
	isArchived: z
		.string()
		.optional()
		.transform((val) => {
			if (val === undefined) return undefined;
			if (val === "true") return true;
			if (val === "false") return false;
			return undefined;
		}),
});

// ============ Batch Update Schemas ============

export const reorderColumnsSchema = z.object({
	boardId: z.string().min(1, "Board ID is required"),
	columnIds: z.array(z.string()).min(1, "Column IDs are required"),
});

export const reorderTasksSchema = z.object({
	columnId: z.string().min(1, "Column ID is required"),
	taskIds: z.array(z.string()).min(1, "Task IDs are required"),
});

export const moveTaskSchema = z.object({
	taskId: z.string().min(1, "Task ID is required"),
	targetColumnId: z.string().min(1, "Target column ID is required"),
	targetOrder: z.number().int().min(0),
});
