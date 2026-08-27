import type { KanbanApiRouter } from "./api";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	Priority,
	SerializedBoard,
	SerializedBoardSummary,
	SerializedBoardWithColumns,
	SerializedColumn,
	SerializedTask,
} from "./types";
import type { StackIdentity } from "@btst/stack/context";
import type { z } from "zod";
import { boardsListDiscriminator } from "./api/query-key-defs";
import type { createBoardSchema } from "./schemas";

/**
 * Browser authorization can change without the URL changing. Protected
 * Kanban queries include this snapshot in their key so data authorized for
 * one identity is never reused by another identity (or while identity is
 * still resolving). `undefined` is shared by anonymous browser requests and
 * the explicitly trusted raw SSG prefetch path so anonymous hydration works.
 */
export type KanbanIdentityPartition = StackIdentity | "pending";

export interface BoardsListParams {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
	limit?: number;
	offset?: number;
}

export type CreateBoardInput = z.input<typeof createBoardSchema>;

export interface UpdateBoardInput {
	id: string;
	data: Partial<{
		name: string;
		description: string;
		slug: string;
	}>;
}

export interface CreateColumnInput {
	title: string;
	boardId: string;
	order?: number;
}

export interface UpdateColumnInput {
	id: string;
	data: Partial<{
		title: string;
		order: number;
	}>;
}

export interface ReorderColumnsInput {
	boardId: string;
	columnIds: string[];
}

export interface CreateTaskInput {
	title: string;
	description?: string;
	priority?: Priority;
	columnId: string;
	assigneeId?: string;
	order?: number;
}

export interface UpdateTaskInput {
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
}

export interface MoveTaskInput {
	taskId: string;
	targetColumnId: string;
	targetOrder: number;
}

export interface ReorderTasksInput {
	columnId: string;
	taskIds: string[];
}

/**
 * Kanban resource declaration — the single source of truth for query keys,
 * HTTP mappings, cache invalidation, and generated client hooks.
 *
 * Board key shapes intentionally match `KANBAN_QUERY_KEYS` so SSR loaders and
 * `prefetchForRoute` hydrate the same cache entries as client hooks.
 */
export const kanbanResources = {
	boards: {
		queries: {
			list: {
				path: "/boards",
				query: (
					params?: BoardsListParams,
					_identityPartition?: KanbanIdentityPartition,
				) => ({
					slug: params?.slug,
					ownerId: params?.ownerId,
					organizationId: params?.organizationId,
					limit: params?.limit ?? 50,
					offset: params?.offset ?? 0,
				}),
				key: (
					params?: BoardsListParams,
					identityPartition?: KanbanIdentityPartition,
				) =>
					identityPartition === undefined
						? [boardsListDiscriminator(params)]
						: [
								boardsListDiscriminator(params),
								{ identity: identityPartition },
							],
				select: (
					data: any,
					_params?: BoardsListParams,
					_identityPartition?: KanbanIdentityPartition,
				): SerializedBoardSummary[] => data?.items ?? [],
			},

			detail: {
				path: "/boards/:id",
				params: (
					boardId: string,
					_identityPartition?: KanbanIdentityPartition,
				) => ({ id: boardId }),
				key: (boardId: string, identityPartition?: KanbanIdentityPartition) =>
					identityPartition === undefined
						? [boardId]
						: [boardId, { identity: identityPartition }],
				select: (
					data: any,
					_boardId: string,
					_identityPartition?: KanbanIdentityPartition,
				): SerializedBoardWithColumns | null => data ?? null,
				skip: (boardId: string, _identityPartition?: KanbanIdentityPartition) =>
					!boardId,
			},

			bySlug: {
				path: "/boards",
				query: (
					slug: string,
					_identityPartition?: KanbanIdentityPartition,
				) => ({ slug, limit: 1 }),
				key: (slug: string, identityPartition?: KanbanIdentityPartition) =>
					identityPartition === undefined
						? ["slug", slug]
						: ["slug", slug, { identity: identityPartition }],
				select: (
					data: any,
					_slug: string,
					_identityPartition?: KanbanIdentityPartition,
				): SerializedBoardSummary | null => data?.items?.[0] ?? null,
				skip: (slug: string, _identityPartition?: KanbanIdentityPartition) =>
					!slug,
			},
		},

		mutations: {
			create: {
				path: "@post/boards",
				method: "POST" as const,
				input: (data: CreateBoardInput) => ({ body: data }),
				select: (data: any) => data as SerializedBoardWithColumns,
				invalidates: ["boards.list"],
				refresh: false,
			},
			update: {
				path: "@put/boards/:id",
				method: "PUT" as const,
				input: ({ id, data }: UpdateBoardInput) => ({
					params: { id },
					body: data,
				}),
				select: (data: any) => data as SerializedBoard,
				invalidates: ["boards"],
				refresh: false,
			},
			delete: {
				path: "@delete/boards/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["boards.list"],
				refresh: false,
			},
		},
	},

	columns: {
		queries: {},
		mutations: {
			create: {
				path: "@post/columns",
				method: "POST" as const,
				input: (data: CreateColumnInput) => ({ body: data }),
				select: (data: any) => data as SerializedColumn,
				invalidates: ["boards"],
				refresh: false,
			},
			update: {
				path: "@put/columns/:id",
				method: "PUT" as const,
				input: ({ id, data }: UpdateColumnInput) => ({
					params: { id },
					body: data,
				}),
				select: (data: any) => data as SerializedColumn,
				invalidates: ["boards"],
				refresh: false,
			},
			delete: {
				path: "@delete/columns/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["boards"],
				refresh: false,
			},
			reorder: {
				path: "@post/columns/reorder",
				method: "POST" as const,
				input: (data: ReorderColumnsInput) => ({ body: data }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["boards"],
				refresh: false,
			},
		},
	},

	tasks: {
		queries: {},
		mutations: {
			create: {
				path: "@post/tasks",
				method: "POST" as const,
				input: (data: CreateTaskInput) => ({ body: data }),
				select: (data: any) => data as SerializedTask,
				invalidates: ["boards"],
				refresh: false,
			},
			update: {
				path: "@put/tasks/:id",
				method: "PUT" as const,
				input: ({ id, data }: UpdateTaskInput) => ({
					params: { id },
					body: data,
				}),
				select: (data: any) => data as SerializedTask,
				invalidates: ["boards"],
				refresh: false,
			},
			delete: {
				path: "@delete/tasks/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["boards"],
				refresh: false,
			},
			move: {
				path: "@post/tasks/move",
				method: "POST" as const,
				input: (data: MoveTaskInput) => ({ body: data }),
				select: (data: any) => data as SerializedTask,
				invalidates: ["boards"],
				refresh: false,
			},
			reorder: {
				path: "@post/tasks/reorder",
				method: "POST" as const,
				input: (data: ReorderTasksInput) => ({ body: data }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["boards"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

const kanbanQueryResources = {
	boards: kanbanResources.boards,
} satisfies ResourcesDeclaration;

export function createKanbanQueryKeys(
	client: ReturnType<typeof createApiClient<KanbanApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, kanbanQueryResources, headers);
}
