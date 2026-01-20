import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { kanbanSchema as dbSchema } from "../db";
import type {
	Board,
	BoardWithKanbanColumn,
	Column,
	ColumnWithTasks,
	Task,
} from "../types";
import { slugify } from "../utils";
import {
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
} from "../schemas";

/**
 * Context passed to kanban API hooks
 */
export interface KanbanApiContext<
	TBody = unknown,
	TParams = unknown,
	TQuery = unknown,
> {
	body?: TBody;
	params?: TParams;
	query?: TQuery;
	request?: Request;
	headers?: Headers;
	[key: string]: unknown;
}

/**
 * Configuration hooks for kanban backend plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface KanbanBackendHooks {
	// ============ Board Hooks ============
	/**
	 * Called before listing boards. Return false to deny access.
	 */
	onBeforeListBoards?: (
		filter: z.infer<typeof BoardListQuerySchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before creating a board. Return false to deny access.
	 */
	onBeforeCreateBoard?: (
		data: z.infer<typeof createBoardSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before reading a single board. Return false to deny access.
	 */
	onBeforeReadBoard?: (
		boardId: string,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before updating a board. Return false to deny access.
	 */
	onBeforeUpdateBoard?: (
		boardId: string,
		data: z.infer<typeof updateBoardSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before deleting a board. Return false to deny access.
	 */
	onBeforeDeleteBoard?: (
		boardId: string,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after boards are listed successfully
	 */
	onBoardsRead?: (
		boards: Board[],
		filter: z.infer<typeof BoardListQuerySchema>,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a single board is read successfully
	 */
	onBoardRead?: (
		board: Board,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a board is created successfully
	 */
	onBoardCreated?: (
		board: Board,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a board is updated successfully
	 */
	onBoardUpdated?: (
		board: Board,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a board is deleted successfully
	 */
	onBoardDeleted?: (
		boardId: string,
		context: KanbanApiContext,
	) => Promise<void> | void;

	/**
	 * Called when listing boards fails
	 */
	onListBoardsError?: (
		error: Error,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called when reading a single board fails
	 */
	onReadBoardError?: (
		error: Error,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called when creating a board fails
	 */
	onCreateBoardError?: (
		error: Error,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called when updating a board fails
	 */
	onUpdateBoardError?: (
		error: Error,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called when deleting a board fails
	 */
	onDeleteBoardError?: (
		error: Error,
		context: KanbanApiContext,
	) => Promise<void> | void;

	// ============ Column Hooks ============
	/**
	 * Called before creating a column. Return false to deny access.
	 */
	onBeforeCreateColumn?: (
		data: z.infer<typeof createColumnSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before updating a column. Return false to deny access.
	 */
	onBeforeUpdateColumn?: (
		columnId: string,
		data: z.infer<typeof updateColumnSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before deleting a column. Return false to deny access.
	 */
	onBeforeDeleteColumn?: (
		columnId: string,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after a column is created successfully
	 */
	onColumnCreated?: (
		column: Column,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a column is updated successfully
	 */
	onColumnUpdated?: (
		column: Column,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a column is deleted successfully
	 */
	onColumnDeleted?: (
		columnId: string,
		context: KanbanApiContext,
	) => Promise<void> | void;

	// ============ Task Hooks ============
	/**
	 * Called before creating a task. Return false to deny access.
	 */
	onBeforeCreateTask?: (
		data: z.infer<typeof createTaskSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before updating a task. Return false to deny access.
	 */
	onBeforeUpdateTask?: (
		taskId: string,
		data: z.infer<typeof updateTaskSchema>,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before deleting a task. Return false to deny access.
	 */
	onBeforeDeleteTask?: (
		taskId: string,
		context: KanbanApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after a task is created successfully
	 */
	onTaskCreated?: (
		task: Task,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a task is updated successfully
	 */
	onTaskUpdated?: (
		task: Task,
		context: KanbanApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a task is deleted successfully
	 */
	onTaskDeleted?: (
		taskId: string,
		context: KanbanApiContext,
	) => Promise<void> | void;
}

/**
 * Kanban backend plugin
 * Provides API endpoints for managing kanban boards, columns, and tasks
 *
 * @param hooks - Optional configuration hooks for customizing plugin behavior
 */
export const kanbanBackendPlugin = (hooks?: KanbanBackendHooks) =>
	defineBackendPlugin({
		name: "kanban",

		dbPlugin: dbSchema,

		routes: (adapter: Adapter) => {
			// ============ Board Endpoints ============

			const listBoards = createEndpoint(
				"/boards",
				{
					method: "GET",
					query: BoardListQuerySchema,
				},
				async (ctx) => {
					const { query, headers } = ctx;
					const context: KanbanApiContext = { query, headers };

					try {
						if (hooks?.onBeforeListBoards) {
							const canList = await hooks.onBeforeListBoards(query, context);
							if (!canList) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot list boards",
								});
							}
						}

						const whereConditions = [];

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

						const boards = await adapter.findMany<BoardWithKanbanColumn>({
							model: "kanbanBoard",
							limit: query.limit ?? 50,
							offset: query.offset ?? 0,
							where: whereConditions,
							sortBy: {
								field: "createdAt",
								direction: "desc",
							},
							join: {
								kanbanColumn: true,
							},
						});

						// Get all column IDs to fetch tasks
						const columnIds: string[] = [];
						for (const board of boards) {
							if (board.kanbanColumn) {
								for (const col of board.kanbanColumn) {
									columnIds.push(col.id);
								}
							}
						}

						// Fetch tasks for each column in parallel (avoids loading all tasks from DB)
						const tasksByColumn = new Map<string, Task[]>();
						if (columnIds.length > 0) {
							const taskQueries = columnIds.map((columnId) =>
								adapter.findMany<Task>({
									model: "kanbanTask",
									where: [
										{
											field: "columnId",
											value: columnId,
											operator: "eq" as const,
										},
									],
									sortBy: { field: "order", direction: "asc" },
								}),
							);
							const taskResults = await Promise.all(taskQueries);
							for (let i = 0; i < columnIds.length; i++) {
								const columnId = columnIds[i];
								const tasks = taskResults[i];
								if (columnId && tasks) {
									tasksByColumn.set(columnId, tasks);
								}
							}
						}

						// Map boards with columns and tasks
						const result = boards.map((board) => {
							const columns = (board.kanbanColumn || [])
								.sort((a, b) => a.order - b.order)
								.map((col) => ({
									...col,
									tasks: tasksByColumn.get(col.id) || [],
								}));
							const { kanbanColumn: _, ...boardWithoutJoin } = board;
							return {
								...boardWithoutJoin,
								columns,
							};
						});

						if (hooks?.onBoardsRead) {
							await hooks.onBoardsRead(result, query, context);
						}

						return result;
					} catch (error) {
						if (hooks?.onListBoardsError) {
							await hooks.onListBoardsError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const getBoard = createEndpoint(
				"/boards/:id",
				{
					method: "GET",
				},
				async (ctx) => {
					const { params, headers } = ctx;
					const context: KanbanApiContext = { params, headers };

					try {
						if (hooks?.onBeforeReadBoard) {
							const canRead = await hooks.onBeforeReadBoard(params.id, context);
							if (!canRead) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot read board",
								});
							}
						}

						const board = await adapter.findOne<BoardWithKanbanColumn>({
							model: "kanbanBoard",
							where: [
								{ field: "id", value: params.id, operator: "eq" as const },
							],
							join: {
								kanbanColumn: true,
							},
						});

						if (!board) {
							throw ctx.error(404, { message: "Board not found" });
						}

						// Fetch tasks for each column in parallel (avoids loading all tasks from DB)
						const columnIds = (board.kanbanColumn || []).map((c) => c.id);
						const tasksByColumn = new Map<string, Task[]>();
						if (columnIds.length > 0) {
							const taskQueries = columnIds.map((columnId) =>
								adapter.findMany<Task>({
									model: "kanbanTask",
									where: [
										{
											field: "columnId",
											value: columnId,
											operator: "eq" as const,
										},
									],
									sortBy: { field: "order", direction: "asc" },
								}),
							);
							const taskResults = await Promise.all(taskQueries);
							for (let i = 0; i < columnIds.length; i++) {
								const columnId = columnIds[i];
								const tasks = taskResults[i];
								if (columnId && tasks) {
									tasksByColumn.set(columnId, tasks);
								}
							}
						}

						const columns = (board.kanbanColumn || [])
							.sort((a, b) => a.order - b.order)
							.map((col) => ({
								...col,
								tasks: tasksByColumn.get(col.id) || [],
							}));

						const { kanbanColumn: _, ...boardWithoutJoin } = board;
						const result = {
							...boardWithoutJoin,
							columns,
						};

						if (hooks?.onBoardRead) {
							await hooks.onBoardRead(result, context);
						}

						return result;
					} catch (error) {
						if (hooks?.onReadBoardError) {
							await hooks.onReadBoardError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const createBoard = createEndpoint(
				"/boards",
				{
					method: "POST",
					body: createBoardSchema,
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeCreateBoard) {
							const canCreate = await hooks.onBeforeCreateBoard(
								ctx.body,
								context,
							);
							if (!canCreate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot create board",
								});
							}
						}

						const { ...boardData } = ctx.body;
						const slug = slugify(boardData.slug || boardData.name);

						if (!slug) {
							throw ctx.error(400, {
								message:
									"Invalid slug: must contain at least one alphanumeric character",
							});
						}

						const newBoard = await adapter.create<Board>({
							model: "kanbanBoard",
							data: {
								...boardData,
								slug,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						// Create default columns
						const defaultColumns = [
							{ title: "To Do", order: 0, boardId: newBoard.id },
							{ title: "In Progress", order: 1, boardId: newBoard.id },
							{ title: "Done", order: 2, boardId: newBoard.id },
						];

						const createdColumns: ColumnWithTasks[] = [];
						for (const colData of defaultColumns) {
							const col = await adapter.create<Column>({
								model: "kanbanColumn",
								data: {
									...colData,
									createdAt: new Date(),
									updatedAt: new Date(),
								},
							});
							createdColumns.push({ ...col, tasks: [] });
						}

						const result = { ...newBoard, columns: createdColumns };

						if (hooks?.onBoardCreated) {
							await hooks.onBoardCreated(result, context);
						}

						return result;
					} catch (error) {
						if (hooks?.onCreateBoardError) {
							await hooks.onCreateBoardError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const updateBoard = createEndpoint(
				"/boards/:id",
				{
					method: "PUT",
					body: updateBoardSchema.omit({ id: true }),
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeUpdateBoard) {
							const canUpdate = await hooks.onBeforeUpdateBoard(
								ctx.params.id,
								{ ...ctx.body, id: ctx.params.id },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot update board",
								});
							}
						}

						const { slug: rawSlug, ...restBoardData } = ctx.body;
						const slugified = rawSlug ? slugify(rawSlug) : undefined;

						if (rawSlug && !slugified) {
							throw ctx.error(400, {
								message:
									"Invalid slug: must contain at least one alphanumeric character",
							});
						}

						const boardData = {
							...restBoardData,
							...(slugified ? { slug: slugified } : {}),
						};

						const updated = await adapter.update<Board>({
							model: "kanbanBoard",
							where: [{ field: "id", value: ctx.params.id }],
							update: {
								...boardData,
								updatedAt: new Date(),
							},
						});

						if (!updated) {
							throw ctx.error(404, { message: "Board not found" });
						}

						if (hooks?.onBoardUpdated) {
							await hooks.onBoardUpdated(updated, context);
						}

						return updated;
					} catch (error) {
						if (hooks?.onUpdateBoardError) {
							await hooks.onUpdateBoardError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const deleteBoard = createEndpoint(
				"/boards/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Verify the board exists before attempting deletion
						const existingBoard = await adapter.findOne<Board>({
							model: "kanbanBoard",
							where: [
								{ field: "id", value: ctx.params.id, operator: "eq" as const },
							],
						});

						if (!existingBoard) {
							throw ctx.error(404, { message: "Board not found" });
						}

						if (hooks?.onBeforeDeleteBoard) {
							const canDelete = await hooks.onBeforeDeleteBoard(
								ctx.params.id,
								context,
							);
							if (!canDelete) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot delete board",
								});
							}
						}

						await adapter.delete<Board>({
							model: "kanbanBoard",
							where: [{ field: "id", value: ctx.params.id }],
						});

						if (hooks?.onBoardDeleted) {
							await hooks.onBoardDeleted(ctx.params.id, context);
						}

						return { success: true };
					} catch (error) {
						if (hooks?.onDeleteBoardError) {
							await hooks.onDeleteBoardError(error as Error, context);
						}
						throw error;
					}
				},
			);

			// ============ Column Endpoints ============

			const createColumn = createEndpoint(
				"/columns",
				{
					method: "POST",
					body: createColumnSchema,
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeCreateColumn) {
							const canCreate = await hooks.onBeforeCreateColumn(
								ctx.body,
								context,
							);
							if (!canCreate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot create column",
								});
							}
						}

						// Get existing columns to determine order
						const existingColumns = await adapter.findMany<Column>({
							model: "kanbanColumn",
							where: [
								{
									field: "boardId",
									value: ctx.body.boardId,
									operator: "eq" as const,
								},
							],
						});
						const nextOrder =
							existingColumns.length > 0
								? Math.max(...existingColumns.map((c) => c.order)) + 1
								: 0;

						const newColumn = await adapter.create<Column>({
							model: "kanbanColumn",
							data: {
								...ctx.body,
								order: ctx.body.order ?? nextOrder,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						if (hooks?.onColumnCreated) {
							await hooks.onColumnCreated(newColumn, context);
						}

						return newColumn;
					} catch (error) {
						throw error;
					}
				},
			);

			const updateColumn = createEndpoint(
				"/columns/:id",
				{
					method: "PUT",
					body: updateColumnSchema.omit({ id: true }),
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeUpdateColumn) {
							const canUpdate = await hooks.onBeforeUpdateColumn(
								ctx.params.id,
								{ ...ctx.body, id: ctx.params.id },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot update column",
								});
							}
						}

						const updated = await adapter.update<Column>({
							model: "kanbanColumn",
							where: [{ field: "id", value: ctx.params.id }],
							update: {
								...ctx.body,
								updatedAt: new Date(),
							},
						});

						if (!updated) {
							throw ctx.error(404, { message: "Column not found" });
						}

						if (hooks?.onColumnUpdated) {
							await hooks.onColumnUpdated(updated, context);
						}

						return updated;
					} catch (error) {
						throw error;
					}
				},
			);

			const deleteColumn = createEndpoint(
				"/columns/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Verify the column exists before attempting deletion
						const existingColumn = await adapter.findOne<Column>({
							model: "kanbanColumn",
							where: [
								{ field: "id", value: ctx.params.id, operator: "eq" as const },
							],
						});

						if (!existingColumn) {
							throw ctx.error(404, { message: "Column not found" });
						}

						if (hooks?.onBeforeDeleteColumn) {
							const canDelete = await hooks.onBeforeDeleteColumn(
								ctx.params.id,
								context,
							);
							if (!canDelete) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot delete column",
								});
							}
						}

						await adapter.delete<Column>({
							model: "kanbanColumn",
							where: [{ field: "id", value: ctx.params.id }],
						});

						if (hooks?.onColumnDeleted) {
							await hooks.onColumnDeleted(ctx.params.id, context);
						}

						return { success: true };
					} catch (error) {
						throw error;
					}
				},
			);

			const reorderColumns = createEndpoint(
				"/columns/reorder",
				{
					method: "POST",
					body: reorderColumnsSchema,
				},
				async (ctx) => {
					const { boardId, columnIds } = ctx.body;
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					// Check authorization for each column being reordered
					if (hooks?.onBeforeUpdateColumn) {
						for (let i = 0; i < columnIds.length; i++) {
							const columnId = columnIds[i];
							if (!columnId) continue;
							const canUpdate = await hooks.onBeforeUpdateColumn(
								columnId,
								{ id: columnId, order: i },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot reorder columns",
								});
							}
						}
					}

					const updatedColumns: Column[] = [];
					await adapter.transaction(async (tx) => {
						for (let i = 0; i < columnIds.length; i++) {
							const columnId = columnIds[i];
							if (!columnId) continue;
							const updated = await tx.update<Column>({
								model: "kanbanColumn",
								where: [
									{ field: "id", value: columnId },
									{ field: "boardId", value: boardId, operator: "eq" as const },
								],
								update: { order: i, updatedAt: new Date() },
							});
							if (updated) {
								updatedColumns.push(updated);
							}
						}
					});

					// Call onColumnUpdated for each reordered column
					if (hooks?.onColumnUpdated) {
						for (const column of updatedColumns) {
							await hooks.onColumnUpdated(column, context);
						}
					}

					return { success: true };
				},
			);

			// ============ Task Endpoints ============

			const createTask = createEndpoint(
				"/tasks",
				{
					method: "POST",
					body: createTaskSchema,
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeCreateTask) {
							const canCreate = await hooks.onBeforeCreateTask(
								ctx.body,
								context,
							);
							if (!canCreate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot create task",
								});
							}
						}

						// Get existing tasks in column to determine order
						const existingTasks = await adapter.findMany<Task>({
							model: "kanbanTask",
							where: [
								{
									field: "columnId",
									value: ctx.body.columnId,
									operator: "eq" as const,
								},
							],
						});
						const nextOrder =
							existingTasks.length > 0
								? Math.max(...existingTasks.map((t) => t.order)) + 1
								: 0;

						const taskData: Omit<Task, "id"> = {
							title: ctx.body.title,
							columnId: ctx.body.columnId,
							description: ctx.body.description,
							priority: ctx.body.priority || "MEDIUM",
							order: ctx.body.order ?? nextOrder,
							assigneeId: ctx.body.assigneeId ?? undefined,
							isArchived: ctx.body.isArchived ?? false,
							createdAt: new Date(),
							updatedAt: new Date(),
						};

						const newTask = await adapter.create<Task>({
							model: "kanbanTask",
							data: taskData,
						});

						if (hooks?.onTaskCreated) {
							await hooks.onTaskCreated(newTask, context);
						}

						return newTask;
					} catch (error) {
						throw error;
					}
				},
			);

			const updateTask = createEndpoint(
				"/tasks/:id",
				{
					method: "PUT",
					body: updateTaskSchema.omit({ id: true }),
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						body: ctx.body,
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeUpdateTask) {
							const canUpdate = await hooks.onBeforeUpdateTask(
								ctx.params.id,
								{ ...ctx.body, id: ctx.params.id },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot update task",
								});
							}
						}

						const updated = await adapter.update<Task>({
							model: "kanbanTask",
							where: [{ field: "id", value: ctx.params.id }],
							update: {
								...ctx.body,
								updatedAt: new Date(),
							},
						});

						if (!updated) {
							throw ctx.error(404, { message: "Task not found" });
						}

						if (hooks?.onTaskUpdated) {
							await hooks.onTaskUpdated(updated, context);
						}

						return updated;
					} catch (error) {
						throw error;
					}
				},
			);

			const deleteTask = createEndpoint(
				"/tasks/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const context: KanbanApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Verify the task exists before attempting deletion
						const existingTask = await adapter.findOne<Task>({
							model: "kanbanTask",
							where: [
								{ field: "id", value: ctx.params.id, operator: "eq" as const },
							],
						});

						if (!existingTask) {
							throw ctx.error(404, { message: "Task not found" });
						}

						if (hooks?.onBeforeDeleteTask) {
							const canDelete = await hooks.onBeforeDeleteTask(
								ctx.params.id,
								context,
							);
							if (!canDelete) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot delete task",
								});
							}
						}

						await adapter.delete<Task>({
							model: "kanbanTask",
							where: [{ field: "id", value: ctx.params.id }],
						});

						if (hooks?.onTaskDeleted) {
							await hooks.onTaskDeleted(ctx.params.id, context);
						}

						return { success: true };
					} catch (error) {
						throw error;
					}
				},
			);

			const moveTask = createEndpoint(
				"/tasks/move",
				{
					method: "POST",
					body: moveTaskSchema,
				},
				async (ctx) => {
					const { taskId, targetColumnId, targetOrder } = ctx.body;
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					// Get current task
					const task = await adapter.findOne<Task>({
						model: "kanbanTask",
						where: [{ field: "id", value: taskId, operator: "eq" as const }],
					});

					if (!task) {
						throw ctx.error(404, { message: "Task not found" });
					}

					// Check authorization before moving task
					if (hooks?.onBeforeUpdateTask) {
						const canUpdate = await hooks.onBeforeUpdateTask(
							taskId,
							{ id: taskId, columnId: targetColumnId, order: targetOrder },
							context,
						);
						if (!canUpdate) {
							throw ctx.error(403, {
								message: "Unauthorized: Cannot move task",
							});
						}
					}

					// Update task with new column and order
					const updated = await adapter.update<Task>({
						model: "kanbanTask",
						where: [{ field: "id", value: taskId }],
						update: {
							columnId: targetColumnId,
							order: targetOrder,
							updatedAt: new Date(),
						},
					});

					if (hooks?.onTaskUpdated && updated) {
						await hooks.onTaskUpdated(updated, context);
					}

					return updated;
				},
			);

			const reorderTasks = createEndpoint(
				"/tasks/reorder",
				{
					method: "POST",
					body: reorderTasksSchema,
				},
				async (ctx) => {
					const { columnId, taskIds } = ctx.body;
					const context: KanbanApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					// Check authorization for each task being reordered
					if (hooks?.onBeforeUpdateTask) {
						for (let i = 0; i < taskIds.length; i++) {
							const taskId = taskIds[i];
							if (!taskId) continue;
							const canUpdate = await hooks.onBeforeUpdateTask(
								taskId,
								{ id: taskId, order: i },
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot reorder tasks",
								});
							}
						}
					}

					const updatedTasks: Task[] = [];
					await adapter.transaction(async (tx) => {
						for (let i = 0; i < taskIds.length; i++) {
							const taskId = taskIds[i];
							if (!taskId) continue;
							const updated = await tx.update<Task>({
								model: "kanbanTask",
								where: [
									{ field: "id", value: taskId },
									{
										field: "columnId",
										value: columnId,
										operator: "eq" as const,
									},
								],
								update: { order: i, updatedAt: new Date() },
							});
							if (updated) {
								updatedTasks.push(updated);
							}
						}
					});

					// Call onTaskUpdated for each reordered task
					if (hooks?.onTaskUpdated) {
						for (const task of updatedTasks) {
							await hooks.onTaskUpdated(task, context);
						}
					}

					return { success: true };
				},
			);

			return {
				listBoards,
				getBoard,
				createBoard,
				updateBoard,
				deleteBoard,
				createColumn,
				updateColumn,
				deleteColumn,
				reorderColumns,
				createTask,
				updateTask,
				deleteTask,
				moveTask,
				reorderTasks,
			} as const;
		},
	});

export type KanbanApiRouter = ReturnType<
	ReturnType<typeof kanbanBackendPlugin>["routes"]
>;
