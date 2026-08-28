import { AsyncLocalStorage } from "node:async_hooks";
import type { DBAdapter as Adapter } from "@btst/db";
import {
	type DeepReadonly,
	defineOperation,
	type Operation,
	type OperationContext,
} from "@btst/stack/plugins/api";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import { z } from "zod";
import { kanbanPermissions } from "../permissions";
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
import type {
	Board,
	BoardWithColumns,
	Column,
	KanbanApiContext,
	KanbanApiResultContext,
	KanbanBackendHooks,
	SerializedBoard,
	SerializedBoardSummary,
	SerializedBoardWithColumns,
	SerializedColumn,
	SerializedTask,
	Task,
} from "../types";
import { slugify } from "../utils";
import { getBoardById, getBoardSummaries } from "./getters";
import { serializeBoardSummary, serializeTask } from "./serializers";

export const BoardIdOperationInputSchema = z.object({ id: z.string() });
export const UpdateBoardOperationInputSchema = z.object({
	id: z.string(),
	data: updateBoardSchema.omit({ id: true }),
});
export const ColumnIdOperationInputSchema = z.object({ id: z.string() });
export const UpdateColumnOperationInputSchema = z.object({
	id: z.string(),
	data: updateColumnSchema.omit({ id: true }).superRefine((data, context) => {
		if (Object.hasOwn(data, "order") && data.order === undefined) {
			context.addIssue({
				code: "custom",
				path: ["order"],
				message: "Order must be a number when provided.",
			});
		}
	}),
});
export const TaskIdOperationInputSchema = z.object({ id: z.string() });
export const UpdateTaskOperationInputSchema = z.object({
	id: z.string(),
	data: updateTaskSchema.omit({ id: true }),
});

type BoardReadFacts = PermissionFactsFor<typeof kanbanPermissions.board.read>;
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

export interface KanbanBoardListResult {
	readonly items: readonly SerializedBoardSummary[];
	readonly total: number;
	readonly limit?: number;
	readonly offset?: number;
}

export type KanbanOperations = {
	readonly listBoards: Operation<
		typeof BoardListQuerySchema,
		typeof kanbanPermissions.board.read,
		KanbanBoardListResult
	>;
	readonly getBoard: Operation<
		typeof BoardIdOperationInputSchema,
		typeof kanbanPermissions.board.read,
		SerializedBoardWithColumns
	>;
	readonly createBoard: Operation<
		typeof createBoardSchema,
		typeof kanbanPermissions.board.create,
		SerializedBoardWithColumns
	>;
	readonly updateBoard: Operation<
		typeof UpdateBoardOperationInputSchema,
		typeof kanbanPermissions.board.update,
		SerializedBoard
	>;
	readonly deleteBoard: Operation<
		typeof BoardIdOperationInputSchema,
		typeof kanbanPermissions.board.delete,
		{ readonly success: true }
	>;
	readonly createColumn: Operation<
		typeof createColumnSchema,
		typeof kanbanPermissions.column.create,
		SerializedColumn
	>;
	readonly updateColumn: Operation<
		typeof UpdateColumnOperationInputSchema,
		typeof kanbanPermissions.column.update,
		SerializedColumn
	>;
	readonly deleteColumn: Operation<
		typeof ColumnIdOperationInputSchema,
		typeof kanbanPermissions.column.delete,
		{ readonly success: true }
	>;
	readonly reorderColumns: Operation<
		typeof reorderColumnsSchema,
		typeof kanbanPermissions.column.reorder,
		{ readonly success: true }
	>;
	readonly createTask: Operation<
		typeof createTaskSchema,
		typeof kanbanPermissions.task.create,
		SerializedTask
	>;
	readonly updateTask: Operation<
		typeof UpdateTaskOperationInputSchema,
		typeof kanbanPermissions.task.update,
		SerializedTask
	>;
	readonly deleteTask: Operation<
		typeof TaskIdOperationInputSchema,
		typeof kanbanPermissions.task.delete,
		{ readonly success: true }
	>;
	readonly moveTask: Operation<
		typeof moveTaskSchema,
		typeof kanbanPermissions.task.move,
		SerializedTask
	>;
	readonly reorderTasks: Operation<
		typeof reorderTasksSchema,
		typeof kanbanPermissions.task.reorder,
		{ readonly success: true }
	>;
};

/** A domain/HTTP failure raised after Kanban authorization succeeds. */
export class KanbanOperationError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(statusCode: number, message: string, code: string) {
		super(message);
		this.name = "KanbanOperationError";
		this.statusCode = statusCode;
		this.code = code;
	}
}

interface BoardSnapshot {
	readonly id: string;
	readonly ownerId?: string;
	readonly organizationId?: string;
	readonly updatedAt: Date;
}

interface ColumnSnapshot {
	readonly id: string;
	readonly boardId: string;
	readonly updatedAt: Date;
}

interface TaskSnapshot {
	readonly id: string;
	readonly columnId: string;
	readonly assigneeId?: string;
	readonly isArchived: boolean;
	readonly updatedAt: Date;
}

interface ColumnAuthorizationSnapshot {
	readonly board: BoardSnapshot;
	readonly column: ColumnSnapshot;
}

interface TaskAuthorizationSnapshot extends ColumnAuthorizationSnapshot {
	readonly task: TaskSnapshot;
}

interface ColumnReorderSnapshot {
	readonly board: BoardSnapshot;
	readonly columns: readonly ColumnSnapshot[];
}

interface TaskReorderSnapshot extends ColumnAuthorizationSnapshot {
	readonly tasks: readonly TaskSnapshot[];
}

interface TaskMoveSnapshot extends TaskAuthorizationSnapshot {
	readonly targetColumn: ColumnSnapshot;
	readonly sourceTasks: readonly TaskSnapshot[];
	readonly targetTasks: readonly TaskSnapshot[];
	readonly targetOrder: number;
}

function boardSnapshot(board: Board): BoardSnapshot {
	return {
		id: board.id,
		...(board.ownerId ? { ownerId: board.ownerId } : {}),
		...(board.organizationId ? { organizationId: board.organizationId } : {}),
		updatedAt: board.updatedAt,
	};
}

function columnSnapshot(column: Column): ColumnSnapshot {
	return {
		id: column.id,
		boardId: column.boardId,
		updatedAt: column.updatedAt,
	};
}

function taskSnapshot(task: Task): TaskSnapshot {
	return {
		id: task.id,
		columnId: task.columnId,
		...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
		isArchived: task.isArchived,
		updatedAt: task.updatedAt,
	};
}

function sameDate(left: Date, right: Date) {
	return left.getTime() === right.getTime();
}

function sameBoard(board: Board | null, expected: BoardSnapshot) {
	return (
		board !== null &&
		board.id === expected.id &&
		(board.ownerId || undefined) === expected.ownerId &&
		(board.organizationId || undefined) === expected.organizationId &&
		sameDate(board.updatedAt, expected.updatedAt)
	);
}

function sameColumn(column: Column | null, expected: ColumnSnapshot) {
	return (
		column !== null &&
		column.id === expected.id &&
		column.boardId === expected.boardId &&
		sameDate(column.updatedAt, expected.updatedAt)
	);
}

function sameTask(task: Task | null, expected: TaskSnapshot) {
	return (
		task !== null &&
		task.id === expected.id &&
		task.columnId === expected.columnId &&
		(task.assigneeId || undefined) === expected.assigneeId &&
		task.isArchived === expected.isArchived &&
		sameDate(task.updatedAt, expected.updatedAt)
	);
}

function sameColumnSnapshots(left: ColumnSnapshot, right: ColumnSnapshot) {
	return (
		left.id === right.id &&
		left.boardId === right.boardId &&
		sameDate(left.updatedAt, right.updatedAt)
	);
}

function sameTaskSnapshots(left: TaskSnapshot, right: TaskSnapshot) {
	return (
		left.id === right.id &&
		left.columnId === right.columnId &&
		left.assigneeId === right.assigneeId &&
		left.isArchived === right.isArchived &&
		sameDate(left.updatedAt, right.updatedAt)
	);
}

function sameSnapshotSet<T extends { id: string }>(
	current: readonly T[],
	expected: readonly T[],
	equal: (value: T, snapshot: T) => boolean,
) {
	if (current.length !== expected.length) return false;
	const byId = new Map(current.map((value) => [value.id, value]));
	return expected.every((snapshot) => {
		const value = byId.get(snapshot.id);
		return value !== undefined && equal(value, snapshot);
	});
}

function nextSnapshotDate(previous: Date) {
	return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

function hasPositiveCount(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value) && value > 0;
	if (typeof value === "bigint") return value > 0n;
	return false;
}

function didAffectRow(result: unknown, expectedId: string): boolean {
	if (typeof result === "number" || typeof result === "bigint") {
		return hasPositiveCount(result);
	}
	if (!result || typeof result !== "object") return false;
	const record = result as Record<string, unknown>;
	if ("count" in record) return hasPositiveCount(record.count);
	if (Array.isArray(result)) {
		return result.length > 0 && didAffectRow(result[0], expectedId);
	}
	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return hasPositiveCount(record[key]);
	}
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				hasPositiveCount((meta as Record<string, unknown>).changes),
		);
	}
	return record.id === expectedId;
}

const memoryRollbackMarkers = new WeakMap<Adapter, (error: unknown) => void>();

function markMemoryRollback(adapter: Adapter, error: unknown) {
	memoryRollbackMarkers.get(adapter)?.(error);
}

/**
 * The published memory adapter rolls back from a whole-database clone but does
 * not isolate overlapping callbacks. Instrument the shared adapter instance
 * so every stack access queues behind whole-database transactions: temporary
 * CAS claims stay private and rollback cannot overwrite a later winner.
 */
function serializeMemoryOperations(adapter: Adapter): Adapter {
	if (adapter.id !== "memory" || memoryRollbackMarkers.has(adapter)) {
		return adapter;
	}
	const source: Adapter = { ...adapter };
	type TransactionAdapter = Parameters<
		Parameters<Adapter["transaction"]>[0]
	>[0];
	type ActiveAdapter = Omit<Adapter, "transaction"> &
		Partial<Pick<Adapter, "transaction">>;
	type LockContext = {
		owner: object;
		adapter: ActiveAdapter;
		inTransaction?: boolean;
		rollbackError?: unknown;
		rollbackOnly?: boolean;
	};
	const lockContext = new AsyncLocalStorage<LockContext>();
	let tail = Promise.resolve();
	let activeOwner: object | undefined;
	const withLock = async <T>(
		run: (activeAdapter: ActiveAdapter) => Promise<T>,
	): Promise<T> => {
		const inherited = lockContext.getStore();
		if (inherited && inherited.owner === activeOwner) {
			return run(inherited.adapter);
		}
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		const owner = {};
		activeOwner = owner;
		try {
			return await lockContext.run({ owner, adapter: source }, () =>
				run(source),
			);
		} finally {
			if (activeOwner === owner) activeOwner = undefined;
			release();
		}
	};
	const serialized: Adapter = {
		...source,
		create: ((input) =>
			withLock((active) => active.create(input))) as Adapter["create"],
		findOne: ((input) =>
			withLock((active) => active.findOne(input))) as Adapter["findOne"],
		findMany: ((input) =>
			withLock((active) => active.findMany(input))) as Adapter["findMany"],
		count: (input) => withLock((active) => active.count(input)),
		update: ((input) =>
			withLock((active) => active.update(input))) as Adapter["update"],
		updateMany: (input) => withLock((active) => active.updateMany(input)),
		delete: ((input) =>
			withLock((active) => active.delete(input))) as Adapter["delete"],
		deleteMany: (input) => withLock((active) => active.deleteMany(input)),
		consumeOne: ((input) =>
			withLock((active) => active.consumeOne(input))) as Adapter["consumeOne"],
		transaction: ((callback) =>
			withLock((active) => {
				const context = lockContext.getStore();
				if (!context) throw new TypeError("Missing memory lock context.");
				if (context.inTransaction) {
					return callback(active as TransactionAdapter).catch((error) => {
						context.rollbackOnly = true;
						context.rollbackError = error;
						throw error;
					});
				}
				if (!active.transaction) {
					throw new TypeError("Missing memory transaction adapter.");
				}
				return active.transaction((tx) =>
					lockContext.run(
						{ owner: context.owner, adapter: tx, inTransaction: true },
						async () => {
							const transactionContext = lockContext.getStore();
							const result = await callback(tx);
							if (transactionContext?.rollbackOnly) {
								throw transactionContext.rollbackError;
							}
							return result;
						},
					),
				);
			})) as Adapter["transaction"],
	};
	memoryRollbackMarkers.set(adapter, (error) => {
		const context = lockContext.getStore();
		if (!context || context.owner !== activeOwner || !context.inTransaction) {
			return;
		}
		context.rollbackOnly = true;
		context.rollbackError = error;
	});
	Object.assign(adapter, serialized);
	return adapter;
}

function requireAtomicTransactions(adapter: Adapter) {
	if (
		adapter.id !== "memory" &&
		typeof adapter.options?.adapterConfig.transaction !== "function"
	) {
		throw new KanbanOperationError(
			500,
			"Kanban writes require an adapter with isolated transaction support.",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	}
}

function boardWhere(snapshot: BoardSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{
			field: "ownerId",
			value: snapshot.ownerId ?? null,
			operator: "eq" as const,
		},
		{
			field: "organizationId",
			value: snapshot.organizationId ?? null,
			operator: "eq" as const,
		},
		{
			field: "updatedAt",
			value: snapshot.updatedAt,
			operator: "eq" as const,
		},
	];
}

function columnWhere(snapshot: ColumnSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "boardId", value: snapshot.boardId, operator: "eq" as const },
		{
			field: "updatedAt",
			value: snapshot.updatedAt,
			operator: "eq" as const,
		},
	];
}

function taskWhere(snapshot: TaskSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "columnId", value: snapshot.columnId, operator: "eq" as const },
		{
			field: "assigneeId",
			value: snapshot.assigneeId ?? null,
			operator: "eq" as const,
		},
		{
			field: "isArchived",
			value: snapshot.isArchived,
			operator: "eq" as const,
		},
		{
			field: "updatedAt",
			value: snapshot.updatedAt,
			operator: "eq" as const,
		},
	];
}

async function claimSnapshot(
	adapter: Pick<Adapter, "updateMany">,
	model: "kanbanBoard" | "kanbanColumn" | "kanbanTask",
	snapshot: BoardSnapshot | ColumnSnapshot | TaskSnapshot,
) {
	const claimedAt = nextSnapshotDate(snapshot.updatedAt);
	const where =
		model === "kanbanBoard"
			? boardWhere(snapshot as BoardSnapshot)
			: model === "kanbanColumn"
				? columnWhere(snapshot as ColumnSnapshot)
				: taskWhere(snapshot as TaskSnapshot);
	const claimed = await adapter.updateMany({
		model,
		where,
		update: { updatedAt: claimedAt },
	});
	if (!didAffectRow(claimed, snapshot.id)) throw staleStateError();
	return claimedAt;
}

async function restoreSnapshot(
	adapter: Pick<Adapter, "updateMany">,
	model: "kanbanBoard" | "kanbanColumn",
	snapshot: BoardSnapshot | ColumnSnapshot,
	claimedAt: Date,
) {
	const where =
		model === "kanbanBoard"
			? boardWhere({ ...(snapshot as BoardSnapshot), updatedAt: claimedAt })
			: columnWhere({ ...(snapshot as ColumnSnapshot), updatedAt: claimedAt });
	const restored = await adapter.updateMany({
		model,
		where,
		update: { updatedAt: snapshot.updatedAt },
	});
	if (!didAffectRow(restored, snapshot.id)) throw staleStateError();
}

async function findBoard(adapter: Pick<Adapter, "findOne">, id: string) {
	return (
		(await adapter.findOne<Board>({
			model: "kanbanBoard",
			where: [{ field: "id", value: id, operator: "eq" as const }],
		})) ?? null
	);
}

async function findColumn(adapter: Pick<Adapter, "findOne">, id: string) {
	return (
		(await adapter.findOne<Column>({
			model: "kanbanColumn",
			where: [{ field: "id", value: id, operator: "eq" as const }],
		})) ?? null
	);
}

async function findTask(adapter: Pick<Adapter, "findOne">, id: string) {
	return (
		(await adapter.findOne<Task>({
			model: "kanbanTask",
			where: [{ field: "id", value: id, operator: "eq" as const }],
		})) ?? null
	);
}

async function listColumns(
	adapter: Pick<Adapter, "findMany">,
	boardId: string,
) {
	return adapter.findMany<Column>({
		model: "kanbanColumn",
		where: [{ field: "boardId", value: boardId, operator: "eq" as const }],
		sortBy: { field: "order", direction: "asc" },
	});
}

async function listTasks(adapter: Pick<Adapter, "findMany">, columnId: string) {
	return adapter.findMany<Task>({
		model: "kanbanTask",
		where: [{ field: "columnId", value: columnId, operator: "eq" as const }],
		sortBy: { field: "order", direction: "asc" },
	});
}

function boardNotFoundError() {
	return new KanbanOperationError(404, "Board not found", "BOARD_NOT_FOUND");
}

function columnNotFoundError() {
	return new KanbanOperationError(404, "Column not found", "COLUMN_NOT_FOUND");
}

function taskNotFoundError() {
	return new KanbanOperationError(404, "Task not found", "TASK_NOT_FOUND");
}

function staleStateError() {
	return new KanbanOperationError(
		409,
		"Kanban state changed while authorization was being evaluated. Retry the operation.",
		"KANBAN_STATE_CHANGED",
	);
}

function invalidColumnSetError() {
	return new KanbanOperationError(
		400,
		"columnIds must contain every current board column exactly once.",
		"INVALID_COLUMN_SET",
	);
}

function invalidTaskSetError() {
	return new KanbanOperationError(
		400,
		"taskIds must contain every current column task exactly once.",
		"INVALID_TASK_SET",
	);
}

function invalidTargetColumnError() {
	return new KanbanOperationError(
		400,
		"The target column must belong to the task's board.",
		"INVALID_TARGET_COLUMN",
	);
}

function sanitizeSlug(value: string) {
	const slug = slugify(value);
	if (!slug) {
		throw new KanbanOperationError(
			400,
			"Invalid slug: must contain at least one alphanumeric character",
			"INVALID_SLUG",
		);
	}
	return slug;
}

function normalizeError(error: unknown, fallback: string) {
	return error instanceof Error
		? error
		: new Error(typeof error === "string" ? error : fallback, { cause: error });
}

async function runDomainHook<T>(
	run: () => Promise<T> | T,
	code: string,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw new KanbanOperationError(
			403,
			normalizeError(error, "Kanban operation rejected").message,
			code,
		);
	}
}

function hookContext<TInput, TFacts, TResult>(
	context: OperationContext<TInput, TFacts> & {
		readonly result: DeepReadonly<TResult>;
	},
	legacy?: { body?: unknown; params?: unknown; query?: unknown },
): KanbanApiResultContext<TInput, TFacts, TResult>;
function hookContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
	legacy?: { body?: unknown; params?: unknown; query?: unknown },
): KanbanApiContext<TInput, TFacts>;
function hookContext<TInput, TFacts, TResult>(
	context:
		| OperationContext<TInput, TFacts>
		| (OperationContext<TInput, TFacts> & {
				readonly result: DeepReadonly<TResult>;
		  }),
	legacy: { body?: unknown; params?: unknown; query?: unknown } = {},
):
	| KanbanApiContext<TInput, TFacts>
	| KanbanApiResultContext<TInput, TFacts, TResult> {
	return Object.freeze({
		...context,
		...(context.request
			? { request: context.request, headers: context.request.headers }
			: {}),
		...legacy,
	});
}

async function notifyBoardError<TInput, TFacts>(
	hook:
		| ((
				error: Error,
				context: KanbanApiContext<TInput, TFacts>,
		  ) => Promise<void> | void)
		| undefined,
	error: unknown,
	context: OperationContext<TInput, TFacts>,
	legacy: { body?: unknown; params?: unknown; query?: unknown } = {},
) {
	const normalized = normalizeError(error, "Kanban board operation failed");
	const lifecycle = hookContext(context, legacy);
	try {
		await hook?.(normalized, lifecycle);
	} catch {
		// Error hooks are observational and must never replace the operation error.
	}
}

function boardFacts(snapshot: BoardSnapshot) {
	return {
		boardId: snapshot.id,
		...(snapshot.ownerId ? { ownerId: snapshot.ownerId } : {}),
		...(snapshot.organizationId
			? { organizationId: snapshot.organizationId }
			: {}),
	};
}

function taskFacts(snapshot: TaskAuthorizationSnapshot) {
	return {
		...boardFacts(snapshot.board),
		columnId: snapshot.column.id,
		taskId: snapshot.task.id,
		...(snapshot.task.assigneeId
			? { assigneeId: snapshot.task.assigneeId }
			: {}),
		isArchived: snapshot.task.isArchived,
	};
}

async function loadColumnAuthorization(
	adapter: Pick<Adapter, "findOne">,
	columnId: string,
): Promise<ColumnAuthorizationSnapshot> {
	const column = await findColumn(adapter, columnId);
	if (!column) throw columnNotFoundError();
	const board = await findBoard(adapter, column.boardId);
	if (!board) throw boardNotFoundError();
	return { board: boardSnapshot(board), column: columnSnapshot(column) };
}

async function loadTaskAuthorization(
	adapter: Pick<Adapter, "findOne">,
	taskId: string,
): Promise<TaskAuthorizationSnapshot> {
	const task = await findTask(adapter, taskId);
	if (!task) throw taskNotFoundError();
	const parent = await loadColumnAuthorization(adapter, task.columnId);
	return { ...parent, task: taskSnapshot(task) };
}

function sameIdSet(left: readonly string[], right: readonly string[]) {
	return (
		left.length === right.length &&
		new Set(left).size === left.length &&
		left.every((id) => right.includes(id))
	);
}

function operationTask(task: Task) {
	const serialized = serializeTask(task);
	return { ...serialized };
}

function operationColumn(column: BoardWithColumns["columns"][number]) {
	return {
		...serializeBareColumn(column),
		tasks: column.tasks.map(operationTask),
	};
}

function operationBoard(board: BoardWithColumns) {
	return {
		...serializeBareBoard(board),
		columns: board.columns.map(operationColumn),
	};
}

function boardSummary(board: Parameters<typeof serializeBoardSummary>[0]) {
	return serializeBoardSummary(board);
}

function serializeBareColumn(column: Column) {
	return {
		...column,
		createdAt: column.createdAt.toISOString(),
		updatedAt: column.updatedAt.toISOString(),
	};
}

function serializeBareBoard(board: Board) {
	return {
		...board,
		createdAt: board.createdAt.toISOString(),
		updatedAt: board.updatedAt.toISOString(),
	};
}

async function verifyBoard(
	adapter: Pick<Adapter, "findOne">,
	expected: BoardSnapshot,
) {
	if (!sameBoard(await findBoard(adapter, expected.id), expected)) {
		throw staleStateError();
	}
}

async function verifyColumnAuthorization(
	adapter: Pick<Adapter, "findOne">,
	expected: ColumnAuthorizationSnapshot,
) {
	await verifyBoard(adapter, expected.board);
	if (
		!sameColumn(await findColumn(adapter, expected.column.id), expected.column)
	) {
		throw staleStateError();
	}
}

async function verifyTaskAuthorization(
	adapter: Pick<Adapter, "findOne">,
	expected: TaskAuthorizationSnapshot,
) {
	await verifyColumnAuthorization(adapter, expected);
	if (!sameTask(await findTask(adapter, expected.task.id), expected.task)) {
		throw staleStateError();
	}
}

async function loadMoveSnapshot(
	adapter: Pick<Adapter, "findOne" | "findMany">,
	primary: TaskAuthorizationSnapshot,
	targetColumnId: string,
	targetOrder: number,
): Promise<TaskMoveSnapshot> {
	await verifyTaskAuthorization(adapter, primary);
	const targetColumn = await findColumn(adapter, targetColumnId);
	if (!targetColumn) throw columnNotFoundError();
	if (targetColumn.boardId !== primary.board.id) {
		throw invalidTargetColumnError();
	}
	const [sourceTasks, targetTasks] = await Promise.all([
		listTasks(adapter, primary.column.id),
		targetColumn.id === primary.column.id
			? Promise.resolve<Task[]>([])
			: listTasks(adapter, targetColumn.id),
	]);
	return {
		...primary,
		targetColumn: columnSnapshot(targetColumn),
		sourceTasks: sourceTasks.map(taskSnapshot),
		targetTasks:
			targetColumn.id === primary.column.id
				? sourceTasks.map(taskSnapshot)
				: targetTasks.map(taskSnapshot),
		targetOrder,
	};
}

async function verifyMoveSnapshot(
	adapter: Pick<Adapter, "findOne" | "findMany">,
	expected: TaskMoveSnapshot,
) {
	await verifyTaskAuthorization(adapter, expected);
	if (
		!sameColumn(
			await findColumn(adapter, expected.targetColumn.id),
			expected.targetColumn,
		)
	) {
		throw staleStateError();
	}
	const sourceTasks = (await listTasks(adapter, expected.column.id)).map(
		taskSnapshot,
	);
	const targetTasks =
		expected.targetColumn.id === expected.column.id
			? sourceTasks
			: (await listTasks(adapter, expected.targetColumn.id)).map(taskSnapshot);
	if (
		!sameSnapshotSet(sourceTasks, expected.sourceTasks, sameTaskSnapshots) ||
		!sameSnapshotSet(targetTasks, expected.targetTasks, sameTaskSnapshots)
	) {
		throw staleStateError();
	}
}

async function claimColumnAuthorization(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: ColumnAuthorizationSnapshot,
) {
	const boardClaimedAt = await claimSnapshot(
		adapter,
		"kanbanBoard",
		snapshot.board,
	);
	const columnClaimedAt = await claimSnapshot(
		adapter,
		"kanbanColumn",
		snapshot.column,
	);
	return { boardClaimedAt, columnClaimedAt };
}

async function restoreColumnAuthorization(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: ColumnAuthorizationSnapshot,
	claims: { boardClaimedAt: Date; columnClaimedAt: Date },
) {
	await restoreSnapshot(
		adapter,
		"kanbanColumn",
		snapshot.column,
		claims.columnClaimedAt,
	);
	await restoreSnapshot(
		adapter,
		"kanbanBoard",
		snapshot.board,
		claims.boardClaimedAt,
	);
}

async function claimMoveSnapshot(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: TaskMoveSnapshot,
) {
	const boardClaimedAt = await claimSnapshot(
		adapter,
		"kanbanBoard",
		snapshot.board,
	);
	const sourceColumnClaimedAt = await claimSnapshot(
		adapter,
		"kanbanColumn",
		snapshot.column,
	);
	const targetColumnClaimedAt =
		snapshot.targetColumn.id === snapshot.column.id
			? sourceColumnClaimedAt
			: await claimSnapshot(adapter, "kanbanColumn", snapshot.targetColumn);
	const taskClaims = new Map<string, Date>();
	const allTasks = new Map<string, TaskSnapshot>();
	for (const task of [...snapshot.sourceTasks, ...snapshot.targetTasks]) {
		allTasks.set(task.id, task);
	}
	for (const task of allTasks.values()) {
		taskClaims.set(task.id, await claimSnapshot(adapter, "kanbanTask", task));
	}
	return {
		boardClaimedAt,
		sourceColumnClaimedAt,
		targetColumnClaimedAt,
		taskClaims,
	};
}

async function applyTaskMove(
	adapter: Pick<Adapter, "updateMany" | "findOne">,
	snapshot: TaskMoveSnapshot,
	claims: Awaited<ReturnType<typeof claimMoveSnapshot>>,
	extraUpdate: Readonly<Record<string, unknown>>,
) {
	const sourceTasks = snapshot.sourceTasks.filter(
		(task) => task.id !== snapshot.task.id,
	);
	const targetBase =
		snapshot.targetColumn.id === snapshot.column.id
			? sourceTasks
			: snapshot.targetTasks.filter((task) => task.id !== snapshot.task.id);
	const targetOrder = Math.min(snapshot.targetOrder, targetBase.length);
	const orderedTarget = [...targetBase];
	orderedTarget.splice(targetOrder, 0, {
		...snapshot.task,
		columnId: snapshot.targetColumn.id,
	});

	const finalRows = new Map<
		string,
		{ snapshot: TaskSnapshot; columnId: string; order: number }
	>();
	if (snapshot.targetColumn.id !== snapshot.column.id) {
		sourceTasks.forEach((task, order) => {
			finalRows.set(task.id, {
				snapshot: task,
				columnId: task.columnId,
				order,
			});
		});
	}
	orderedTarget.forEach((task, order) => {
		const original =
			task.id === snapshot.task.id
				? snapshot.task
				: (snapshot.targetTasks.find((candidate) => candidate.id === task.id) ??
					task);
		finalRows.set(task.id, {
			snapshot: original,
			columnId: snapshot.targetColumn.id,
			order,
		});
	});

	let moved: Task | null = null;
	for (const row of finalRows.values()) {
		const claimedAt = claims.taskClaims.get(row.snapshot.id);
		if (!claimedAt) throw staleStateError();
		const matched = await adapter.updateMany({
			model: "kanbanTask",
			where: taskWhere({ ...row.snapshot, updatedAt: claimedAt }),
			update: {
				...(row.snapshot.id === snapshot.task.id ? extraUpdate : {}),
				columnId: row.columnId,
				order: row.order,
				updatedAt: nextSnapshotDate(claimedAt),
			},
		});
		if (!didAffectRow(matched, row.snapshot.id)) throw staleStateError();
		if (row.snapshot.id === snapshot.task.id) {
			moved = await findTask(adapter, row.snapshot.id);
		}
	}
	if (!moved) throw taskNotFoundError();
	await restoreSnapshot(
		adapter,
		"kanbanColumn",
		snapshot.column,
		claims.sourceColumnClaimedAt,
	);
	if (snapshot.targetColumn.id !== snapshot.column.id) {
		await restoreSnapshot(
			adapter,
			"kanbanColumn",
			snapshot.targetColumn,
			claims.targetColumnClaimedAt,
		);
	}
	await restoreSnapshot(
		adapter,
		"kanbanBoard",
		snapshot.board,
		claims.boardClaimedAt,
	);
	return moved;
}

function sameOptionalBoard(
	board: Board | null,
	expected: BoardSnapshot | null,
) {
	return expected === null ? board === null : sameBoard(board, expected);
}

/** Create the complete Kanban operation inventory for every server transport. */
export function createKanbanOperations(
	sourceAdapter: Adapter,
	hooks?: KanbanBackendHooks,
): KanbanOperations {
	const adapter = serializeMemoryOperations(sourceAdapter);
	const boardSnapshots = new WeakMap<object, BoardSnapshot | null>();
	const columnSnapshots = new WeakMap<object, ColumnAuthorizationSnapshot>();
	const taskSnapshots = new WeakMap<object, TaskAuthorizationSnapshot>();
	const columnReorderSnapshots = new WeakMap<object, ColumnReorderSnapshot>();
	const taskReorderSnapshots = new WeakMap<object, TaskReorderSnapshot>();
	const taskMoveSnapshots = new WeakMap<object, TaskMoveSnapshot>();
	const updateTaskMoveSnapshots = new WeakMap<object, TaskMoveSnapshot>();
	const reorderedColumns = new WeakMap<object, readonly SerializedColumn[]>();
	const reorderedTasks = new WeakMap<object, readonly SerializedTask[]>();

	const listBoards = defineOperation({
		input: BoardListQuerySchema,
		permission: kanbanPermissions.board.read,
		legacyAuthorization: () => ({
			resource: "kanban:board",
			action: "read",
		}),
		facts: () => ({ scope: "collection" as const }),
		before: async (context) => {
			await runDomainHook(
				() =>
					hooks?.onBeforeListBoards?.(
						{ ...context.input },
						hookContext(context, { query: context.input }),
					),
				"LIST_BOARDS_REJECTED",
			);
		},
		execute: async ({ input }) => {
			const result = await getBoardSummaries(adapter, input);
			return {
				items: result.items.map(boardSummary),
				total: result.total,
				...(result.limit !== undefined ? { limit: result.limit } : {}),
				...(result.offset !== undefined ? { offset: result.offset } : {}),
			};
		},
		after: async (context) => {
			await hooks?.onBoardsRead?.(
				context.result.items,
				{ ...context.input },
				hookContext(context, { query: context.input }),
			);
		},
		onError: ({ error, ...context }) =>
			notifyBoardError(hooks?.onListBoardsError, error, context, {
				query: context.input,
			}),
	});

	const getBoard = defineOperation({
		input: BoardIdOperationInputSchema,
		permission: kanbanPermissions.board.read,
		legacyAuthorization: ({ facts }) => {
			if (facts.scope !== "record") {
				throw new TypeError("Board detail requires record facts.");
			}
			return {
				resource: "kanban:board",
				action: "read",
				params: {
					id: facts.boardId,
					...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
					...(facts.organizationId
						? { organizationId: facts.organizationId }
						: {}),
				},
			};
		},
		facts: async ({ input }) => {
			const board = await findBoard(adapter, input.id);
			const snapshot = board ? boardSnapshot(board) : null;
			boardSnapshots.set(input as object, snapshot);
			return {
				scope: "record" as const,
				boardId: input.id,
				exists: snapshot !== null,
				...(snapshot ? boardFacts(snapshot) : {}),
			} satisfies BoardReadFacts;
		},
		before: async (context) => {
			const expected = boardSnapshots.get(context.input as object) ?? null;
			if (
				!sameOptionalBoard(await findBoard(adapter, context.input.id), expected)
			) {
				throw staleStateError();
			}
			await runDomainHook(
				() =>
					hooks?.onBeforeReadBoard?.(
						context.input.id,
						hookContext(context, { params: { id: context.input.id } }),
					),
				"READ_BOARD_REJECTED",
			);
		},
		execute: async (context) => {
			const expected = boardSnapshots.get(context.input as object) ?? null;
			const board = await getBoardById(adapter, context.input.id);
			if (!sameOptionalBoard(board, expected)) {
				throw staleStateError();
			}
			if (!board) throw boardNotFoundError();
			return operationBoard(board);
		},
		after: async (context) => {
			await hooks?.onBoardRead?.(
				context.result,
				hookContext<
					z.output<typeof BoardIdOperationInputSchema>,
					BoardReadFacts,
					SerializedBoardWithColumns
				>(context, { params: { id: context.input.id } }),
			);
		},
		onError: ({ error, ...context }) =>
			notifyBoardError(hooks?.onReadBoardError, error, context, {
				params: { id: context.input.id },
			}),
	});

	const createBoard = defineOperation({
		input: createBoardSchema,
		permission: kanbanPermissions.board.create,
		legacyAuthorization: () => ({
			resource: "kanban:board",
			action: "create",
		}),
		facts: () => undefined,
		execute: async (context) => {
			const data = { ...context.input };
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await runDomainHook(
					() =>
						hooks?.onBeforeCreateBoard?.(
							data,
							hookContext(context, { body: data }),
						),
					"CREATE_BOARD_REJECTED",
				);
				const input = {
					...data,
					slug: sanitizeSlug(data.slug || data.name),
					...(context.identity ? { ownerId: context.identity.id } : {}),
				};
				const now = new Date();
				const board = await tx.create<Board>({
					model: "kanbanBoard",
					data: {
						...input,
						createdAt: now,
						updatedAt: now,
					},
				});
				const columns: Column[] = [];
				for (const [order, title] of [
					"To Do",
					"In Progress",
					"Done",
				].entries()) {
					columns.push(
						await tx.create<Column>({
							model: "kanbanColumn",
							data: {
								title,
								boardId: board.id,
								order,
								createdAt: now,
								updatedAt: now,
							},
						}),
					);
				}
				return operationBoard({
					...board,
					columns: columns.map((column) => ({ ...column, tasks: [] })),
				});
			});
		},
		after: async (context) => {
			await hooks?.onBoardCreated?.(
				context.result,
				hookContext<
					z.output<typeof createBoardSchema>,
					undefined,
					SerializedBoardWithColumns
				>(context, { body: context.input }),
			);
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyBoardError(hooks?.onCreateBoardError, error, context, {
				body: context.input,
			});
		},
	});

	const updateBoard = defineOperation({
		input: UpdateBoardOperationInputSchema,
		permission: kanbanPermissions.board.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:board",
			action: "update",
			params: {
				id: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const board = await findBoard(adapter, input.id);
			if (!board) throw boardNotFoundError();
			const snapshot = boardSnapshot(board);
			boardSnapshots.set(input as object, snapshot);
			return boardFacts(snapshot) satisfies BoardUpdateFacts;
		},
		execute: async (context) => {
			const snapshot = boardSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			const data = {
				...context.input.data,
				...(context.input.data.slug
					? { slug: sanitizeSlug(context.input.data.slug) }
					: {}),
			};
			return adapter.transaction(async (tx) => {
				await verifyBoard(tx, snapshot);
				const claimedAt = await claimSnapshot(tx, "kanbanBoard", snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeUpdateBoard?.(
							context.input.id,
							{ ...data, id: context.input.id },
							hookContext(context, {
								body: data,
								params: { id: context.input.id },
							}),
						),
					"UPDATE_BOARD_REJECTED",
				);
				const matched = await tx.updateMany({
					model: "kanbanBoard",
					where: boardWhere({ ...snapshot, updatedAt: claimedAt }),
					update: {
						...data,
						updatedAt: nextSnapshotDate(claimedAt),
					},
				});
				if (!didAffectRow(matched, snapshot.id)) throw staleStateError();
				const updated = await findBoard(tx, snapshot.id);
				if (!updated) throw boardNotFoundError();
				return serializeBareBoard(updated);
			});
		},
		after: async (context) => {
			await hooks?.onBoardUpdated?.(
				context.result,
				hookContext(context, {
					body: context.input.data,
					params: { id: context.input.id },
				}),
			);
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyBoardError(hooks?.onUpdateBoardError, error, context, {
				body: context.input.data,
				params: { id: context.input.id },
			});
		},
	});

	const deleteBoard = defineOperation({
		input: BoardIdOperationInputSchema,
		permission: kanbanPermissions.board.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:board",
			action: "delete",
			params: {
				id: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const board = await findBoard(adapter, input.id);
			if (!board) throw boardNotFoundError();
			const snapshot = boardSnapshot(board);
			boardSnapshots.set(input as object, snapshot);
			return boardFacts(snapshot) satisfies BoardDeleteFacts;
		},
		execute: async (context) => {
			const snapshot = boardSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyBoard(tx, snapshot);
				const claimedAt = await claimSnapshot(tx, "kanbanBoard", snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeDeleteBoard?.(
							context.input.id,
							hookContext(context, {
								params: { id: context.input.id },
							}),
						),
					"DELETE_BOARD_REJECTED",
				);
				const deleted = await tx.deleteMany({
					model: "kanbanBoard",
					where: boardWhere({ ...snapshot, updatedAt: claimedAt }),
				});
				if (!didAffectRow(deleted, snapshot.id)) throw staleStateError();
				return { success: true } as const;
			});
		},
		after: async (context) => {
			await hooks?.onBoardDeleted?.(
				context.input.id,
				hookContext(context, { params: { id: context.input.id } }),
			);
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyBoardError(hooks?.onDeleteBoardError, error, context, {
				params: { id: context.input.id },
			});
		},
	});

	const createColumn = defineOperation({
		input: createColumnSchema,
		permission: kanbanPermissions.column.create,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:column",
			action: "create",
			params: {
				boardId: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const board = await findBoard(adapter, input.boardId);
			if (!board) throw boardNotFoundError();
			const snapshot = boardSnapshot(board);
			boardSnapshots.set(input as object, snapshot);
			return boardFacts(snapshot) satisfies ColumnCreateFacts;
		},
		execute: async (context) => {
			const board = boardSnapshots.get(context.input as object);
			if (!board) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyBoard(tx, board);
				const boardClaimedAt = await claimSnapshot(tx, "kanbanBoard", board);
				await runDomainHook(
					() =>
						hooks?.onBeforeCreateColumn?.(
							{ ...context.input },
							hookContext(context, { body: context.input }),
						),
					"CREATE_COLUMN_REJECTED",
				);
				const existing = await listColumns(tx, board.id);
				const nextOrder =
					existing.length === 0
						? 0
						: Math.max(...existing.map((column) => column.order)) + 1;
				const now = new Date();
				const column = await tx.create<Column>({
					model: "kanbanColumn",
					data: {
						...context.input,
						order: context.input.order ?? nextOrder,
						createdAt: now,
						updatedAt: now,
					},
				});
				await restoreSnapshot(tx, "kanbanBoard", board, boardClaimedAt);
				return serializeBareColumn(column);
			});
		},
		after: async (context) => {
			await hooks?.onColumnCreated?.(
				context.result,
				hookContext(context, { body: context.input }),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const updateColumn = defineOperation({
		input: UpdateColumnOperationInputSchema,
		permission: kanbanPermissions.column.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:column",
			action: "update",
			params: {
				id: facts.columnId,
				boardId: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const snapshot = await loadColumnAuthorization(adapter, input.id);
			columnSnapshots.set(input as object, snapshot);
			return {
				...boardFacts(snapshot.board),
				columnId: snapshot.column.id,
			} satisfies ColumnUpdateFacts;
		},
		additionalPermissions: ({ input }) => {
			if (input.data.order === undefined) return [];
			const snapshot = columnSnapshots.get(input as object);
			if (!snapshot) throw staleStateError();
			return [kanbanPermissions.column.reorder(boardFacts(snapshot.board))];
		},
		legacyAdditionalAuthorization: ({ id, facts }) => {
			if (id !== kanbanPermissions.column.reorder.id) {
				throw new TypeError(`Unknown Kanban compound permission: ${id}`);
			}
			const reorder = facts as ColumnReorderFacts;
			return {
				resource: "kanban:column",
				action: "update",
				params: {
					boardId: reorder.boardId,
					...(reorder.ownerId ? { ownerId: reorder.ownerId } : {}),
					...(reorder.organizationId
						? { organizationId: reorder.organizationId }
						: {}),
				},
			};
		},
		execute: async (context) => {
			const snapshot = columnSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			if (
				context.input.data.boardId &&
				context.input.data.boardId !== snapshot.board.id
			) {
				throw invalidTargetColumnError();
			}
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyColumnAuthorization(tx, snapshot);
				const claims = await claimColumnAuthorization(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeUpdateColumn?.(
							context.input.id,
							{ ...context.input.data, id: context.input.id },
							hookContext(context, {
								body: context.input.data,
								params: { id: context.input.id },
							}),
						),
					"UPDATE_COLUMN_REJECTED",
				);
				const matched = await tx.updateMany({
					model: "kanbanColumn",
					where: columnWhere({
						...snapshot.column,
						updatedAt: claims.columnClaimedAt,
					}),
					update: {
						...context.input.data,
						boardId: snapshot.board.id,
						updatedAt: nextSnapshotDate(claims.columnClaimedAt),
					},
				});
				if (!didAffectRow(matched, snapshot.column.id)) {
					throw staleStateError();
				}
				await restoreSnapshot(
					tx,
					"kanbanBoard",
					snapshot.board,
					claims.boardClaimedAt,
				);
				const updated = await findColumn(tx, snapshot.column.id);
				if (!updated) throw columnNotFoundError();
				return serializeBareColumn(updated);
			});
		},
		after: async (context) => {
			await hooks?.onColumnUpdated?.(
				context.result,
				hookContext(context, {
					body: context.input.data,
					params: { id: context.input.id },
				}),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const deleteColumn = defineOperation({
		input: ColumnIdOperationInputSchema,
		permission: kanbanPermissions.column.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:column",
			action: "delete",
			params: {
				id: facts.columnId,
				boardId: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const snapshot = await loadColumnAuthorization(adapter, input.id);
			columnSnapshots.set(input as object, snapshot);
			return {
				...boardFacts(snapshot.board),
				columnId: snapshot.column.id,
			} satisfies ColumnDeleteFacts;
		},
		execute: async (context) => {
			const snapshot = columnSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyColumnAuthorization(tx, snapshot);
				const claims = await claimColumnAuthorization(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeDeleteColumn?.(
							context.input.id,
							hookContext(context, {
								params: { id: context.input.id },
							}),
						),
					"DELETE_COLUMN_REJECTED",
				);
				const deleted = await tx.deleteMany({
					model: "kanbanColumn",
					where: columnWhere({
						...snapshot.column,
						updatedAt: claims.columnClaimedAt,
					}),
				});
				if (!didAffectRow(deleted, snapshot.column.id)) {
					throw staleStateError();
				}
				await restoreSnapshot(
					tx,
					"kanbanBoard",
					snapshot.board,
					claims.boardClaimedAt,
				);
				return { success: true } as const;
			});
		},
		after: async (context) => {
			await hooks?.onColumnDeleted?.(
				context.input.id,
				hookContext(context, { params: { id: context.input.id } }),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const reorderColumns = defineOperation({
		input: reorderColumnsSchema,
		permission: kanbanPermissions.column.reorder,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:column",
			action: "update",
			params: {
				boardId: facts.boardId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const board = await findBoard(adapter, input.boardId);
			if (!board) throw boardNotFoundError();
			const columns = await listColumns(adapter, board.id);
			if (
				!sameIdSet(
					input.columnIds,
					columns.map((column) => column.id),
				)
			) {
				throw invalidColumnSetError();
			}
			const snapshot = {
				board: boardSnapshot(board),
				columns: columns.map(columnSnapshot),
			};
			columnReorderSnapshots.set(input as object, snapshot);
			return boardFacts(snapshot.board) satisfies ColumnReorderFacts;
		},
		execute: async (context) => {
			const snapshot = columnReorderSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyBoard(tx, snapshot.board);
				const current = (await listColumns(tx, snapshot.board.id)).map(
					columnSnapshot,
				);
				if (!sameSnapshotSet(current, snapshot.columns, sameColumnSnapshots)) {
					throw staleStateError();
				}
				const boardClaimedAt = await claimSnapshot(
					tx,
					"kanbanBoard",
					snapshot.board,
				);
				const claims = new Map<string, Date>();
				for (const column of snapshot.columns) {
					claims.set(
						column.id,
						await claimSnapshot(tx, "kanbanColumn", column),
					);
				}
				for (const [order, columnId] of context.input.columnIds.entries()) {
					await runDomainHook(
						() =>
							hooks?.onBeforeUpdateColumn?.(
								columnId,
								{ id: columnId, order },
								hookContext(context, { body: context.input }),
							),
						"REORDER_COLUMNS_REJECTED",
					);
				}
				const updated: SerializedColumn[] = [];
				for (const [order, columnId] of context.input.columnIds.entries()) {
					const original = snapshot.columns.find(
						(column) => column.id === columnId,
					);
					const claimedAt = claims.get(columnId);
					if (!original || !claimedAt) throw staleStateError();
					const matched = await tx.updateMany({
						model: "kanbanColumn",
						where: columnWhere({ ...original, updatedAt: claimedAt }),
						update: { order, updatedAt: nextSnapshotDate(claimedAt) },
					});
					if (!didAffectRow(matched, columnId)) throw staleStateError();
					const column = await findColumn(tx, columnId);
					if (!column) throw columnNotFoundError();
					updated.push(serializeBareColumn(column));
				}
				await restoreSnapshot(
					tx,
					"kanbanBoard",
					snapshot.board,
					boardClaimedAt,
				);
				const result = { success: true } as const;
				reorderedColumns.set(result, updated);
				return result;
			});
		},
		after: async (context) => {
			for (const column of reorderedColumns.get(context.result) ?? []) {
				await hooks?.onColumnUpdated?.(
					column,
					hookContext<
						z.output<typeof reorderColumnsSchema>,
						ColumnReorderFacts,
						{ readonly success: true }
					>(context, { body: context.input }),
				);
			}
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const createTask = defineOperation({
		input: createTaskSchema,
		permission: kanbanPermissions.task.create,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:task",
			action: "create",
			params: {
				boardId: facts.boardId,
				columnId: facts.columnId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const snapshot = await loadColumnAuthorization(adapter, input.columnId);
			columnSnapshots.set(input as object, snapshot);
			return {
				...boardFacts(snapshot.board),
				columnId: snapshot.column.id,
			} satisfies TaskCreateFacts;
		},
		execute: async (context) => {
			const snapshot = columnSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyColumnAuthorization(tx, snapshot);
				const claims = await claimColumnAuthorization(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeCreateTask?.(
							{ ...context.input },
							hookContext(context, { body: context.input }),
						),
					"CREATE_TASK_REJECTED",
				);
				const existing = await listTasks(tx, snapshot.column.id);
				const nextOrder =
					existing.length === 0
						? 0
						: Math.max(...existing.map((task) => task.order)) + 1;
				const now = new Date();
				const { completedAt, ...persistenceInput } = context.input;
				const task = await tx.create<Task>({
					model: "kanbanTask",
					data: {
						...persistenceInput,
						priority: context.input.priority ?? "MEDIUM",
						order: context.input.order ?? nextOrder,
						assigneeId: context.input.assigneeId ?? undefined,
						isArchived: context.input.isArchived ?? false,
						...(completedAt ? { completedAt: new Date(completedAt) } : {}),
						createdAt: now,
						updatedAt: now,
					},
				});
				await restoreColumnAuthorization(tx, snapshot, claims);
				return operationTask(task);
			});
		},
		after: async (context) => {
			await hooks?.onTaskCreated?.(
				context.result,
				hookContext(context, { body: context.input }),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const updateTask = defineOperation({
		input: UpdateTaskOperationInputSchema,
		permission: kanbanPermissions.task.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:task",
			action: "update",
			params: {
				id: facts.taskId,
				boardId: facts.boardId,
				columnId: facts.columnId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
				...(facts.assigneeId ? { assigneeId: facts.assigneeId } : {}),
				isArchived: facts.isArchived,
			},
		}),
		facts: async ({ input }) => {
			const snapshot = await loadTaskAuthorization(adapter, input.id);
			taskSnapshots.set(input as object, snapshot);
			return taskFacts(snapshot) satisfies TaskUpdateFacts;
		},
		additionalPermissions: async ({ input }) => {
			const snapshot = taskSnapshots.get(input as object);
			if (!snapshot) throw staleStateError();
			const targetColumnId = input.data.columnId ?? snapshot.column.id;
			const changesColumn = targetColumnId !== snapshot.column.id;
			const changesOrder = input.data.order !== undefined;
			if (!changesColumn && !changesOrder) return [];
			const moveSnapshot = await loadMoveSnapshot(
				adapter,
				snapshot,
				targetColumnId,
				input.data.order ?? Number.MAX_SAFE_INTEGER,
			);
			updateTaskMoveSnapshots.set(input as object, moveSnapshot);
			return [
				kanbanPermissions.task.move({
					...taskFacts(moveSnapshot),
					targetColumnId: moveSnapshot.targetColumn.id,
				}),
			];
		},
		legacyAdditionalAuthorization: ({ id, facts }) => {
			if (id !== kanbanPermissions.task.move.id) {
				throw new TypeError(`Unknown Kanban compound permission: ${id}`);
			}
			const move = facts as TaskMoveFacts;
			return {
				resource: "kanban:task",
				action: "update",
				params: {
					id: move.taskId,
					boardId: move.boardId,
					columnId: move.columnId,
					targetColumnId: move.targetColumnId,
					...(move.ownerId ? { ownerId: move.ownerId } : {}),
					...(move.organizationId
						? { organizationId: move.organizationId }
						: {}),
					...(move.assigneeId ? { assigneeId: move.assigneeId } : {}),
					isArchived: move.isArchived,
				},
			};
		},
		execute: async (context) => {
			const snapshot = taskSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			const {
				columnId: _columnId,
				order: _order,
				completedAt,
				...operationTaskData
			} = context.input.data;
			const taskData = {
				...operationTaskData,
				...(completedAt ? { completedAt: new Date(completedAt) } : {}),
			};
			const moveSnapshot = updateTaskMoveSnapshots.get(context.input as object);
			if (moveSnapshot) {
				return adapter.transaction(async (tx) => {
					await verifyMoveSnapshot(tx, moveSnapshot);
					const claims = await claimMoveSnapshot(tx, moveSnapshot);
					await runDomainHook(
						() =>
							hooks?.onBeforeUpdateTask?.(
								context.input.id,
								{ ...context.input.data, id: context.input.id },
								hookContext(context, {
									body: context.input.data,
									params: { id: context.input.id },
								}),
							),
						"UPDATE_TASK_REJECTED",
					);
					return operationTask(
						await applyTaskMove(tx, moveSnapshot, claims, taskData),
					);
				});
			}
			return adapter.transaction(async (tx) => {
				await verifyTaskAuthorization(tx, snapshot);
				const claims = await claimColumnAuthorization(tx, snapshot);
				const taskClaimedAt = await claimSnapshot(
					tx,
					"kanbanTask",
					snapshot.task,
				);
				await runDomainHook(
					() =>
						hooks?.onBeforeUpdateTask?.(
							context.input.id,
							{ ...context.input.data, id: context.input.id },
							hookContext(context, {
								body: context.input.data,
								params: { id: context.input.id },
							}),
						),
					"UPDATE_TASK_REJECTED",
				);
				const matched = await tx.updateMany({
					model: "kanbanTask",
					where: taskWhere({
						...snapshot.task,
						updatedAt: taskClaimedAt,
					}),
					update: {
						...taskData,
						updatedAt: nextSnapshotDate(taskClaimedAt),
					},
				});
				if (!didAffectRow(matched, snapshot.task.id)) {
					throw staleStateError();
				}
				await restoreColumnAuthorization(tx, snapshot, claims);
				const updated = await findTask(tx, snapshot.task.id);
				if (!updated) throw taskNotFoundError();
				return operationTask(updated);
			});
		},
		after: async (context) => {
			await hooks?.onTaskUpdated?.(
				context.result,
				hookContext(context, {
					body: context.input.data,
					params: { id: context.input.id },
				}),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const deleteTask = defineOperation({
		input: TaskIdOperationInputSchema,
		permission: kanbanPermissions.task.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:task",
			action: "delete",
			params: {
				id: facts.taskId,
				boardId: facts.boardId,
				columnId: facts.columnId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
				...(facts.assigneeId ? { assigneeId: facts.assigneeId } : {}),
				isArchived: facts.isArchived,
			},
		}),
		facts: async ({ input }) => {
			const snapshot = await loadTaskAuthorization(adapter, input.id);
			taskSnapshots.set(input as object, snapshot);
			return taskFacts(snapshot) satisfies TaskDeleteFacts;
		},
		execute: async (context) => {
			const snapshot = taskSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyTaskAuthorization(tx, snapshot);
				const claims = await claimColumnAuthorization(tx, snapshot);
				const taskClaimedAt = await claimSnapshot(
					tx,
					"kanbanTask",
					snapshot.task,
				);
				await runDomainHook(
					() =>
						hooks?.onBeforeDeleteTask?.(
							context.input.id,
							hookContext(context, {
								params: { id: context.input.id },
							}),
						),
					"DELETE_TASK_REJECTED",
				);
				const deleted = await tx.deleteMany({
					model: "kanbanTask",
					where: taskWhere({
						...snapshot.task,
						updatedAt: taskClaimedAt,
					}),
				});
				if (!didAffectRow(deleted, snapshot.task.id)) {
					throw staleStateError();
				}
				await restoreColumnAuthorization(tx, snapshot, claims);
				return { success: true } as const;
			});
		},
		after: async (context) => {
			await hooks?.onTaskDeleted?.(
				context.input.id,
				hookContext(context, { params: { id: context.input.id } }),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const moveTask = defineOperation({
		input: moveTaskSchema,
		permission: kanbanPermissions.task.move,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:task",
			action: "update",
			params: {
				id: facts.taskId,
				boardId: facts.boardId,
				columnId: facts.columnId,
				targetColumnId: facts.targetColumnId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
				...(facts.assigneeId ? { assigneeId: facts.assigneeId } : {}),
				isArchived: facts.isArchived,
			},
		}),
		facts: async ({ input }) => {
			const primary = await loadTaskAuthorization(adapter, input.taskId);
			const snapshot = await loadMoveSnapshot(
				adapter,
				primary,
				input.targetColumnId,
				input.targetOrder,
			);
			taskMoveSnapshots.set(input as object, snapshot);
			return {
				...taskFacts(snapshot),
				targetColumnId: snapshot.targetColumn.id,
			} satisfies TaskMoveFacts;
		},
		execute: async (context) => {
			const snapshot = taskMoveSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyMoveSnapshot(tx, snapshot);
				const claims = await claimMoveSnapshot(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeUpdateTask?.(
							context.input.taskId,
							{
								id: context.input.taskId,
								columnId: context.input.targetColumnId,
								order: context.input.targetOrder,
							},
							hookContext(context, { body: context.input }),
						),
					"MOVE_TASK_REJECTED",
				);
				return operationTask(await applyTaskMove(tx, snapshot, claims, {}));
			});
		},
		after: async (context) => {
			await hooks?.onTaskUpdated?.(
				context.result,
				hookContext(context, { body: context.input }),
			);
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

	const reorderTasks = defineOperation({
		input: reorderTasksSchema,
		permission: kanbanPermissions.task.reorder,
		legacyAuthorization: ({ facts }) => ({
			resource: "kanban:task",
			action: "update",
			params: {
				boardId: facts.boardId,
				columnId: facts.columnId,
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
				...(facts.organizationId
					? { organizationId: facts.organizationId }
					: {}),
			},
		}),
		facts: async ({ input }) => {
			const parent = await loadColumnAuthorization(adapter, input.columnId);
			const tasks = await listTasks(adapter, input.columnId);
			if (
				!sameIdSet(
					input.taskIds,
					tasks.map((task) => task.id),
				)
			) {
				throw invalidTaskSetError();
			}
			const snapshot = { ...parent, tasks: tasks.map(taskSnapshot) };
			taskReorderSnapshots.set(input as object, snapshot);
			return {
				...boardFacts(parent.board),
				columnId: parent.column.id,
			} satisfies TaskReorderFacts;
		},
		execute: async (context) => {
			const snapshot = taskReorderSnapshots.get(context.input as object);
			if (!snapshot) throw staleStateError();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyColumnAuthorization(tx, snapshot);
				const current = (await listTasks(tx, snapshot.column.id)).map(
					taskSnapshot,
				);
				if (!sameSnapshotSet(current, snapshot.tasks, sameTaskSnapshots)) {
					throw staleStateError();
				}
				const parentClaims = await claimColumnAuthorization(tx, snapshot);
				const taskClaims = new Map<string, Date>();
				for (const task of snapshot.tasks) {
					taskClaims.set(task.id, await claimSnapshot(tx, "kanbanTask", task));
				}
				for (const [order, taskId] of context.input.taskIds.entries()) {
					await runDomainHook(
						() =>
							hooks?.onBeforeUpdateTask?.(
								taskId,
								{ id: taskId, order },
								hookContext(context, { body: context.input }),
							),
						"REORDER_TASKS_REJECTED",
					);
				}
				const updated: SerializedTask[] = [];
				for (const [order, taskId] of context.input.taskIds.entries()) {
					const original = snapshot.tasks.find((task) => task.id === taskId);
					const claimedAt = taskClaims.get(taskId);
					if (!original || !claimedAt) throw staleStateError();
					const matched = await tx.updateMany({
						model: "kanbanTask",
						where: taskWhere({ ...original, updatedAt: claimedAt }),
						update: { order, updatedAt: nextSnapshotDate(claimedAt) },
					});
					if (!didAffectRow(matched, taskId)) throw staleStateError();
					const task = await findTask(tx, taskId);
					if (!task) throw taskNotFoundError();
					updated.push(operationTask(task));
				}
				await restoreColumnAuthorization(tx, snapshot, parentClaims);
				const result = { success: true } as const;
				reorderedTasks.set(result, updated);
				return result;
			});
		},
		after: async (context) => {
			for (const task of reorderedTasks.get(context.result) ?? []) {
				await hooks?.onTaskUpdated?.(
					task,
					hookContext<
						z.output<typeof reorderTasksSchema>,
						TaskReorderFacts,
						{ readonly success: true }
					>(context, { body: context.input }),
				);
			}
		},
		onError: ({ error }) => markMemoryRollback(adapter, error),
	});

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
	};
}
