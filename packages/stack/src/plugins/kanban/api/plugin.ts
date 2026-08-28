import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { kanbanSchema as dbSchema } from "../db";
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
import type { KanbanBackendHooks } from "../types";
import { getBoardById, getBoardSummaries } from "./getters";
import {
	BoardIdOperationInputSchema,
	createKanbanOperations,
} from "./operations";
import { KANBAN_QUERY_KEYS } from "./query-key-defs";
import { serializeBoard, serializeBoardSummary } from "./serializers";

/** Configuration for the Kanban backend plugin. */
export interface KanbanBackendOptions {
	/** Post-authorization domain lifecycle hooks. */
	hooks?: KanbanBackendHooks;
}

export {
	BoardIdOperationInputSchema,
	ColumnIdOperationInputSchema,
	TaskIdOperationInputSchema,
	UpdateBoardOperationInputSchema,
	UpdateColumnOperationInputSchema,
	UpdateTaskOperationInputSchema,
} from "./operations";

/** Route keys returned by the Kanban client plugin. */
export type KanbanRouteKey = "boards" | "newBoard" | "board";

interface KanbanPrefetchForRoute {
	(key: "boards" | "newBoard", qc: QueryClient): Promise<void>;
	(key: "board", qc: QueryClient, params: { boardId: string }): Promise<void>;
}

/**
 * Trusted raw SSG path. It bypasses request authorization and seeds only the
 * route data selected by the caller. Protected static output needs equivalent
 * deployment-level access controls.
 */
function createKanbanPrefetchForRoute(
	adapter: Adapter,
): KanbanPrefetchForRoute {
	return async function prefetchForRoute(
		key: KanbanRouteKey,
		queryClient: QueryClient,
		params?: Record<string, string>,
	): Promise<void> {
		switch (key) {
			case "boards": {
				const result = await getBoardSummaries(adapter, {
					limit: 50,
					offset: 0,
				});
				queryClient.setQueryData(
					KANBAN_QUERY_KEYS.boardsList({}),
					result.items.map(serializeBoardSummary),
				);
				break;
			}
			case "board": {
				const boardId = params?.boardId ?? "";
				if (boardId) {
					const board = await getBoardById(adapter, boardId);
					queryClient.setQueryData(
						KANBAN_QUERY_KEYS.boardDetail(boardId),
						board ? serializeBoard(board) : null,
					);
				}
				break;
			}
			default:
				break;
		}
	} as KanbanPrefetchForRoute;
}

/** Kanban backend plugin backed by one operation inventory. */
export const kanbanBackendPlugin = (options: KanbanBackendOptions = {}) =>
	defineBackendPlugin({
		id: "kanban",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createKanbanOperations(adapter, options.hooks),

		/** Lower-level SSG helper that intentionally bypasses auth and hooks. */
		raw: (adapter: Adapter) => ({
			prefetchForRoute: createKanbanPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listBoards = createEndpoint(
				"/boards",
				{ method: "GET", query: BoardListQuerySchema, requireRequest: true },
				operations.listBoards.route((ctx) => ctx.query),
			);
			const getBoard = createEndpoint(
				"/boards/:id",
				{
					method: "GET",
					params: BoardIdOperationInputSchema,
					requireRequest: true,
				},
				operations.getBoard.route((ctx) => ctx.params),
			);
			const createBoard = createEndpoint(
				"/boards",
				{ method: "POST", body: createBoardSchema, requireRequest: true },
				operations.createBoard.route((ctx) => ctx.body),
			);
			const updateBoard = createEndpoint(
				"/boards/:id",
				{
					method: "PUT",
					body: updateBoardSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.updateBoard.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);
			const deleteBoard = createEndpoint(
				"/boards/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteBoard.route((ctx) => ({ id: ctx.params.id })),
			);
			const createColumn = createEndpoint(
				"/columns",
				{ method: "POST", body: createColumnSchema, requireRequest: true },
				operations.createColumn.route((ctx) => ctx.body),
			);
			const updateColumn = createEndpoint(
				"/columns/:id",
				{
					method: "PUT",
					body: updateColumnSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.updateColumn.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);
			const deleteColumn = createEndpoint(
				"/columns/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteColumn.route((ctx) => ({ id: ctx.params.id })),
			);
			const reorderColumns = createEndpoint(
				"/columns/reorder",
				{ method: "POST", body: reorderColumnsSchema, requireRequest: true },
				operations.reorderColumns.route((ctx) => ctx.body),
			);
			const createTask = createEndpoint(
				"/tasks",
				{ method: "POST", body: createTaskSchema, requireRequest: true },
				operations.createTask.route((ctx) => ctx.body),
			);
			const updateTask = createEndpoint(
				"/tasks/:id",
				{
					method: "PUT",
					body: updateTaskSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.updateTask.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);
			const deleteTask = createEndpoint(
				"/tasks/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteTask.route((ctx) => ({ id: ctx.params.id })),
			);
			const moveTask = createEndpoint(
				"/tasks/move",
				{ method: "POST", body: moveTaskSchema, requireRequest: true },
				operations.moveTask.route((ctx) => ctx.body),
			);
			const reorderTasks = createEndpoint(
				"/tasks/reorder",
				{ method: "POST", body: reorderTasksSchema, requireRequest: true },
				operations.reorderTasks.route((ctx) => ctx.body),
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
