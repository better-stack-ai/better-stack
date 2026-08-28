import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { AuthorizationError } from "../../../authorization/server";
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
import { getAllBoards, getBoardById, getBoardSummaries } from "./getters";
import {
	createKanbanTask,
	findOrCreateKanbanBoard,
	getKanbanColumnsByBoardId,
} from "./mutations";
import {
	BoardIdOperationInputSchema,
	KanbanOperationError,
	createKanbanOperations,
} from "./operations";
import { KANBAN_QUERY_KEYS } from "./query-key-defs";
import { serializeBoard, serializeBoardSummary } from "./serializers";

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

type EndpointErrorFactory = (...args: any[]) => Error;

async function adaptOperationToHttp<TResult>(
	execute: () => Promise<TResult>,
	error: EndpointErrorFactory,
): Promise<TResult> {
	try {
		return await execute();
	} catch (cause) {
		if (
			cause instanceof AuthorizationError ||
			cause instanceof KanbanOperationError
		) {
			throw error(cause.statusCode, {
				message: cause.message,
				...(cause instanceof KanbanOperationError ? { code: cause.code } : {}),
			});
		}
		throw cause;
	}
}

/** Kanban backend plugin backed by one operation inventory. */
export const kanbanBackendPlugin = (hooks?: KanbanBackendHooks) =>
	defineBackendPlugin({
		name: "kanban",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) => createKanbanOperations(adapter, hooks),

		/** Lower-level server API that intentionally bypasses auth and hooks. */
		api: (adapter: Adapter) => ({
			getAllBoards: (params?: Parameters<typeof getAllBoards>[1]) =>
				getAllBoards(adapter, params),
			getBoardById: (id: string) => getBoardById(adapter, id),
			prefetchForRoute: createKanbanPrefetchForRoute(adapter),
			createTask: (input: Parameters<typeof createKanbanTask>[1]) =>
				createKanbanTask(adapter, input),
			findOrCreateBoard: (slug: string, name: string, columnTitles: string[]) =>
				findOrCreateKanbanBoard(adapter, slug, name, columnTitles),
			getColumnsByBoardId: (boardId: string) =>
				getKanbanColumnsByBoardId(adapter, boardId),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listBoards = createEndpoint(
				"/boards",
				{ method: "GET", query: BoardListQuerySchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.listBoards(ctx.query, ctx.request),
						ctx.error,
					),
			);
			const getBoard = createEndpoint(
				"/boards/:id",
				{
					method: "GET",
					params: BoardIdOperationInputSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getBoard(ctx.params, ctx.request),
						ctx.error,
					),
			);
			const createBoard = createEndpoint(
				"/boards",
				{ method: "POST", body: createBoardSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createBoard(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const updateBoard = createEndpoint(
				"/boards/:id",
				{
					method: "PUT",
					body: updateBoardSchema.omit({ id: true }),
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateBoard(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);
			const deleteBoard = createEndpoint(
				"/boards/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deleteBoard({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);
			const createColumn = createEndpoint(
				"/columns",
				{ method: "POST", body: createColumnSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createColumn(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const updateColumn = createEndpoint(
				"/columns/:id",
				{
					method: "PUT",
					body: updateColumnSchema.omit({ id: true }),
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateColumn(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);
			const deleteColumn = createEndpoint(
				"/columns/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deleteColumn({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);
			const reorderColumns = createEndpoint(
				"/columns/reorder",
				{ method: "POST", body: reorderColumnsSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.reorderColumns(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const createTask = createEndpoint(
				"/tasks",
				{ method: "POST", body: createTaskSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createTask(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const updateTask = createEndpoint(
				"/tasks/:id",
				{
					method: "PUT",
					body: updateTaskSchema.omit({ id: true }),
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateTask(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);
			const deleteTask = createEndpoint(
				"/tasks/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deleteTask({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);
			const moveTask = createEndpoint(
				"/tasks/move",
				{ method: "POST", body: moveTaskSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.moveTask(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const reorderTasks = createEndpoint(
				"/tasks/reorder",
				{ method: "POST", body: reorderTasksSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.reorderTasks(ctx.body, ctx.request),
						ctx.error,
					),
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
