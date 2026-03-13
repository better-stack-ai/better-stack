import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { CommentsApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type { SerializedComment, CommentListResult } from "./types";
import {
	commentsListDiscriminator,
	commentCountDiscriminator,
} from "./api/query-key-defs";

interface CommentsListParams {
	resourceId?: string;
	resourceType?: string;
	parentId?: string | null;
	status?: "pending" | "approved" | "spam";
	currentUserId?: string;
	authorId?: string;
	sort?: "asc" | "desc";
	limit?: number;
	offset?: number;
}

interface CommentCountParams {
	resourceId: string;
	resourceType: string;
	status?: "pending" | "approved" | "spam";
}

function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		(response as Record<string, unknown>).error !== null &&
		(response as Record<string, unknown>).error !== undefined
	);
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "object" && error !== null) {
		const obj = error as Record<string, unknown>;
		const message =
			(typeof obj.message === "string" ? obj.message : null) ||
			(typeof obj.error === "string" ? obj.error : null) ||
			JSON.stringify(error);
		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}
	return new Error(String(error));
}

export function createCommentsQueryKeys(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return mergeQueryKeys(
		createCommentsQueries(client, headers),
		createCommentCountQueries(client, headers),
	);
}

function createCommentsQueries(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("comments", {
		list: (params?: CommentsListParams) => ({
			queryKey: [commentsListDiscriminator(params)],
			queryFn: async (): Promise<CommentListResult> => {
				const response = await client("/comments", {
					method: "GET",
					query: {
						resourceId: params?.resourceId,
						resourceType: params?.resourceType,
						parentId: params?.parentId ?? undefined,
						status: params?.status,
						currentUserId: params?.currentUserId,
						authorId: params?.authorId,
						sort: params?.sort,
						limit: params?.limit ?? 20,
						offset: params?.offset ?? 0,
					},
					headers,
				});

				if (isErrorResponse(response)) {
					throw toError((response as { error: unknown }).error);
				}

				const data = (response as { data?: unknown }).data as
					| CommentListResult
					| undefined;
				return data ?? { items: [], total: 0, limit: 20, offset: 0 };
			},
		}),

		detail: (id: string) => ({
			queryKey: [id],
			queryFn: async (): Promise<SerializedComment | null> => {
				if (!id) return null;
				// Single comment fetch — reuse list with implicit filtering
				// (the backend does not expose GET /comments/:id publicly, use list)
				return null;
			},
		}),
	});
}

function createCommentCountQueries(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("commentCount", {
		byResource: (params: CommentCountParams) => ({
			queryKey: [commentCountDiscriminator(params)],
			queryFn: async (): Promise<number> => {
				const response = await client("/comments/count", {
					method: "GET",
					query: {
						resourceId: params.resourceId,
						resourceType: params.resourceType,
						status: params.status,
					},
					headers,
				});

				if (isErrorResponse(response)) {
					throw toError((response as { error: unknown }).error);
				}

				const data = (response as { data?: unknown }).data as
					| { count: number }
					| undefined;
				return data?.count ?? 0;
			},
		}),
	});
}
