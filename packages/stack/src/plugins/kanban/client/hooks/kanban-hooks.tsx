"use client";

import { useQuery } from "@tanstack/react-query";
import {
	useIdentity,
	useIdentitySourceGeneration,
	usePluginOverrides,
} from "@btst/stack/context";
import type {
	ResourceFormConfig,
	ResourceFormResult,
} from "@btst/stack/plugins/client/hooks";
import type { KanbanPluginOverrides, KanbanUser } from "../overrides";
import type {
	SerializedBoard,
	SerializedColumn,
	SerializedTask,
} from "../../types";
import { kanban } from "./kanban-resource";

function useIdentityPartition() {
	const { identity, isPending, error } = useIdentity();
	const sourceGeneration = useIdentitySourceGeneration();
	if (isPending) return `pending:${sourceGeneration}` as const;
	if (error) return `error:${sourceGeneration}` as const;
	return identity ?? undefined;
}

function isUnresolvedIdentityPartition(
	partition: ReturnType<typeof useIdentityPartition>,
) {
	return typeof partition === "string";
}

// ============ Board Hooks ============

/** Hook to fetch a list of boards. */
export function useBoards(params?: {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
}) {
	const identityPartition = useIdentityPartition();
	return kanban.boards.list.use([params, identityPartition]);
}

/** Suspense variant of useBoards. */
export function useSuspenseBoards(params?: {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
}) {
	const identityPartition = useIdentityPartition();
	return kanban.boards.list.useSuspense([params, identityPartition]);
}

/** Hook to fetch a single board by ID. */
export function useBoard(boardId: string) {
	const identityPartition = useIdentityPartition();
	return kanban.boards.detail.use([boardId, identityPartition], {
		enabled: !!boardId,
	});
}

/** Suspense variant of useBoard. */
export function useSuspenseBoard(boardId: string) {
	const identityPartition = useIdentityPartition();
	return kanban.boards.detail.useSuspense([boardId, identityPartition]);
}

/**
 * Form lifecycle hook for creating/editing boards. It submits the matching
 * resource mutation and exposes normalized field-level server errors.
 */
export function useBoardForm<TValues>(
	config: ResourceFormConfig<TValues, SerializedBoard | null, SerializedBoard>,
): ResourceFormResult<TValues, SerializedBoard | null, SerializedBoard> {
	return kanban.boards.useForm<
		TValues,
		SerializedBoard,
		SerializedBoard | null
	>(config);
}

/** Hook for board CRUD mutations. */
export function useBoardMutations() {
	const createMutation = kanban.boards.create.use();
	const updateMutation = kanban.boards.update.use();
	const deleteMutation = kanban.boards.delete.use();

	return {
		createBoard: createMutation.mutateAsync,
		updateBoard: (
			id: string,
			data: Parameters<typeof updateMutation.mutateAsync>[0]["data"],
		) => updateMutation.mutateAsync({ id, data }),
		deleteBoard: deleteMutation.mutateAsync,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
	};
}

// ============ Column Hooks ============

/**
 * Form lifecycle hook for creating/editing columns with server field errors.
 */
export function useColumnForm<TValues>(
	config: ResourceFormConfig<
		TValues,
		SerializedColumn | null,
		SerializedColumn
	>,
): ResourceFormResult<TValues, SerializedColumn | null, SerializedColumn> {
	return kanban.columns.useForm<
		TValues,
		SerializedColumn,
		SerializedColumn | null
	>(config);
}

/** Hook for column CRUD and reorder mutations. */
export function useColumnMutations() {
	const createMutation = kanban.columns.create.use();
	const updateMutation = kanban.columns.update.use();
	const deleteMutation = kanban.columns.delete.use();
	const reorderMutation = kanban.columns.reorder.use();

	return {
		createColumn: createMutation.mutateAsync,
		updateColumn: (
			id: string,
			data: Parameters<typeof updateMutation.mutateAsync>[0]["data"],
		) => updateMutation.mutateAsync({ id, data }),
		deleteColumn: deleteMutation.mutateAsync,
		reorderColumns: (boardId: string, columnIds: string[]) =>
			reorderMutation.mutateAsync({ boardId, columnIds }),
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isReordering: reorderMutation.isPending,
		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
		reorderError: reorderMutation.error,
	};
}

// ============ Task Hooks ============

/**
 * Form lifecycle hook for creating/editing tasks with server field errors.
 */
export function useTaskForm<TValues>(
	config: ResourceFormConfig<TValues, SerializedTask | null, SerializedTask>,
): ResourceFormResult<TValues, SerializedTask | null, SerializedTask> {
	return kanban.tasks.useForm<TValues, SerializedTask, SerializedTask | null>(
		config,
	);
}

/** Hook for task CRUD, move, and reorder mutations. */
export function useTaskMutations() {
	const createMutation = kanban.tasks.create.use();
	const updateMutation = kanban.tasks.update.use();
	const deleteMutation = kanban.tasks.delete.use();
	const moveMutation = kanban.tasks.move.use();
	const reorderMutation = kanban.tasks.reorder.use();

	return {
		createTask: createMutation.mutateAsync,
		updateTask: (
			id: string,
			data: Parameters<typeof updateMutation.mutateAsync>[0]["data"],
		) => updateMutation.mutateAsync({ id, data }),
		deleteTask: deleteMutation.mutateAsync,
		moveTask: (taskId: string, targetColumnId: string, targetOrder: number) =>
			moveMutation.mutateAsync({ taskId, targetColumnId, targetOrder }),
		reorderTasks: (columnId: string, taskIds: string[]) =>
			reorderMutation.mutateAsync({ columnId, taskIds }),
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isMoving: moveMutation.isPending,
		isReordering: reorderMutation.isPending,
		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
		moveError: moveMutation.error,
		reorderError: reorderMutation.error,
	};
}

// ============ User Resolution Hooks ============

/** Resolve a user from the consumer-provided callback. */
export function useResolveUser(userId: string | undefined | null) {
	const { resolveUser } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const identityPartition = useIdentityPartition();

	return useQuery<KanbanUser | null>({
		queryKey: ["kanban", "users", userId, identityPartition],
		queryFn: async () => {
			if (!userId) return null;
			return resolveUser(userId);
		},
		enabled: !!userId && !isUnresolvedIdentityPartition(identityPartition),
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
}

/** Search for assignable users through the consumer-provided callback. */
export function useSearchUsers(query: string, boardId?: string) {
	const { searchUsers } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const identityPartition = useIdentityPartition();

	return useQuery<KanbanUser[]>({
		queryKey: ["kanban", "users", "search", query, boardId, identityPartition],
		queryFn: () => searchUsers(query, boardId),
		enabled: !isUnresolvedIdentityPartition(identityPartition),
		staleTime: 30_000,
	});
}
