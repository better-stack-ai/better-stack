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
import type { KanbanPluginOverrides } from "../overrides";
import type {
	SerializedBoard,
	SerializedBoardWithColumns,
	SerializedColumn,
	SerializedTask,
	Priority,
} from "../../types";

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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
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
			if ("error" in response && response.error) {
				throw new Error(String(response.error));
			}
			return response.data as unknown as SerializedTask;
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
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isMoving: moveMutation.isPending,
	};
}
