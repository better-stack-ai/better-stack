"use client";

import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createApiClient } from "@btst/stack/plugins/client";
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanApiRouter } from "../../api";
import { createKanbanQueryKeys } from "../../query-keys";
import type { KanbanPluginOverrides, KanbanUser } from "../overrides";
import type {
	SerializedBoard,
	SerializedBoardWithColumns,
	SerializedColumn,
	SerializedTask,
	Priority,
} from "../../types";

// ============ Error Handling ============

// Type guard for better-call error responses
function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		response.error !== null &&
		response.error !== undefined
	);
}

// Helper to convert error to a proper Error object with meaningful message
function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			(typeof errorObj.error === "string" ? errorObj.error : null) ||
			JSON.stringify(error);

		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}

	return new Error(String(error));
}

// ============ API Client Hook ============

function useKanbanClient() {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<KanbanPluginOverrides>("kanban");

	const client = createApiClient<KanbanApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	return { client, headers };
}

// ============ Board Hooks ============

/**
 * Hook to fetch list of boards
 */
export function useBoards(params?: {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
}) {
	const { client, headers } = useKanbanClient();
	const queries = createKanbanQueryKeys(client, headers);

	return useQuery({
		...queries.boards.list(params),
		staleTime: 30_000,
	});
}

/**
 * Hook to fetch list of boards with suspense
 */
export function useSuspenseBoards(params?: {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
}) {
	const { client, headers } = useKanbanClient();
	const queries = createKanbanQueryKeys(client, headers);

	const result = useSuspenseQuery({
		...queries.boards.list(params),
		staleTime: 30_000,
	});

	if (result.error && !result.isFetching) {
		throw result.error;
	}

	return result;
}

/**
 * Hook to fetch a single board by ID
 */
export function useBoard(boardId: string) {
	const { client, headers } = useKanbanClient();
	const queries = createKanbanQueryKeys(client, headers);

	return useQuery({
		...queries.boards.detail(boardId),
		staleTime: 30_000,
		enabled: !!boardId,
	});
}

/**
 * Hook to fetch a single board with suspense
 */
export function useSuspenseBoard(boardId: string) {
	const { client, headers } = useKanbanClient();
	const queries = createKanbanQueryKeys(client, headers);

	const result = useSuspenseQuery({
		...queries.boards.detail(boardId),
		staleTime: 30_000,
	});

	if (result.error && !result.isFetching) {
		throw result.error;
	}

	return result;
}

// ============ Board Mutations ============

/**
 * Hook for board CRUD mutations
 */
export function useBoardMutations() {
	const { client, headers } = useKanbanClient();
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: async (data: {
			name: string;
			description?: string;
			ownerId?: string;
			organizationId?: string;
		}) => {
			const response = await client("@post/boards", {
				method: "POST",
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedBoardWithColumns;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{
				name: string;
				description: string;
				slug: string;
			}>;
		}) => {
			const response = await client("@put/boards/:id", {
				method: "PUT",
				params: { id },
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedBoard;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const response = await client("@delete/boards/:id", {
				method: "DELETE",
				params: { id },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as { success: boolean };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

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

// ============ Column Mutations ============

/**
 * Hook for column CRUD mutations
 */
export function useColumnMutations() {
	const { client, headers } = useKanbanClient();
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: async (data: {
			title: string;
			boardId: string;
			order?: number;
		}) => {
			const response = await client("@post/columns", {
				method: "POST",
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedColumn;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{
				title: string;
				order: number;
			}>;
		}) => {
			const response = await client("@put/columns/:id", {
				method: "PUT",
				params: { id },
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedColumn;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const response = await client("@delete/columns/:id", {
				method: "DELETE",
				params: { id },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as { success: boolean };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const reorderMutation = useMutation({
		mutationFn: async ({
			boardId,
			columnIds,
		}: {
			boardId: string;
			columnIds: string[];
		}) => {
			const response = await client("@post/columns/reorder", {
				method: "POST",
				body: { boardId, columnIds },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as { success: boolean };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

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

// ============ Task Mutations ============

/**
 * Hook for task CRUD mutations
 */
export function useTaskMutations() {
	const { client, headers } = useKanbanClient();
	const queryClient = useQueryClient();

	const createMutation = useMutation({
		mutationFn: async (data: {
			title: string;
			description?: string;
			priority?: Priority;
			columnId: string;
			assigneeId?: string;
			order?: number;
		}) => {
			const response = await client("@post/tasks", {
				method: "POST",
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedTask;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: async ({
			id,
			data,
		}: {
			id: string;
			data: Partial<{
				title: string;
				description: string;
				priority: Priority;
				columnId: string;
				assigneeId: string | null;
				order: number;
				isArchived: boolean;
			}>;
		}) => {
			const response = await client("@put/tasks/:id", {
				method: "PUT",
				params: { id },
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedTask;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const response = await client("@delete/tasks/:id", {
				method: "DELETE",
				params: { id },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as { success: boolean };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const moveMutation = useMutation({
		mutationFn: async ({
			taskId,
			targetColumnId,
			targetOrder,
		}: {
			taskId: string;
			targetColumnId: string;
			targetOrder: number;
		}) => {
			const response = await client("@post/tasks/move", {
				method: "POST",
				body: { taskId, targetColumnId, targetOrder },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as SerializedTask;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

	const reorderMutation = useMutation({
		mutationFn: async ({
			columnId,
			taskIds,
		}: {
			columnId: string;
			taskIds: string[];
		}) => {
			const response = await client("@post/tasks/reorder", {
				method: "POST",
				body: { columnId, taskIds },
				headers,
			});
			if (isErrorResponse(response)) {
				const errorResponse = response as { error: unknown };
				throw toError(errorResponse.error);
			}
			return response.data as unknown as { success: boolean };
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["boards"] });
		},
	});

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

/**
 * Hook to resolve a user from their ID
 * Caches results to avoid repeated lookups
 */
export function useResolveUser(userId: string | undefined | null) {
	const { resolveUser } = usePluginOverrides<KanbanPluginOverrides>("kanban");

	return useQuery<KanbanUser | null>({
		queryKey: ["kanban", "users", userId],
		queryFn: async () => {
			if (!userId) return null;
			const result = await resolveUser(userId);
			return result;
		},
		enabled: !!userId,
		staleTime: 5 * 60 * 1000, // Cache user info for 5 minutes
		gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
	});
}

/**
 * Hook to search for users available for assignment
 * @param query - Search query (empty string for all users)
 * @param boardId - Optional board context for scoped user lists
 */
export function useSearchUsers(query: string, boardId?: string) {
	const { searchUsers } = usePluginOverrides<KanbanPluginOverrides>("kanban");

	return useQuery<KanbanUser[]>({
		queryKey: ["kanban", "users", "search", query, boardId],
		queryFn: async () => {
			const result = await searchUsers(query, boardId);
			return result;
		},
		staleTime: 30_000, // Cache search results for 30 seconds
	});
}
