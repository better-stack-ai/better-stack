import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { CommentsApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type { CommentListResult } from "./types";
import {
	commentsListDiscriminator,
	commentCountDiscriminator,
	commentsThreadDiscriminator,
} from "./api/query-key-defs";
import { toError } from "./error-utils";

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

export function createCommentsQueryKeys(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return mergeQueryKeys(
		createCommentsQueries(client, headers),
		createCommentCountQueries(client, headers),
		createCommentsThreadQueries(client, headers),
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
						parentId: params?.parentId === null ? "null" : params?.parentId,
						status: params?.status,
						// currentUserId is intentionally NOT sent to the server.
						// The server resolves the caller's identity server-side via the
						// resolveCurrentUserId hook. Sending it would allow any caller to
						// impersonate another user and read their pending comments.
						// It is still included in the queryKey above for client-side
						// cache segregation (different users get different cache entries).
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

/**
 * Factory for the infinite thread query key family.
 * Mirrors the blog's `createPostsQueries` pattern: the key is stable (no offset),
 * and pages are fetched via `pageParam` passed to the queryFn.
 */
function createCommentsThreadQueries(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("commentsThread", {
		list: (params?: {
			resourceId?: string;
			resourceType?: string;
			parentId?: string | null;
			status?: "pending" | "approved" | "spam";
			currentUserId?: string;
			limit?: number;
		}) => ({
			// Offset is excluded from the key — it is driven by pageParam.
			queryKey: [commentsThreadDiscriminator(params)],
			queryFn: async ({
				pageParam,
			}: {
				pageParam?: number;
			} = {}): Promise<CommentListResult> => {
				const response = await client("/comments", {
					method: "GET",
					query: {
						resourceId: params?.resourceId,
						resourceType: params?.resourceType,
						parentId: params?.parentId === null ? "null" : params?.parentId,
						status: params?.status,
						// currentUserId is intentionally NOT sent to the server.
						// The server resolves the caller's identity server-side via the
						// resolveCurrentUserId hook. It is still included in the queryKey
						// above for client-side cache segregation.
						limit: params?.limit ?? 20,
						offset: pageParam ?? 0,
					},
					headers,
				});

				if (isErrorResponse(response)) {
					throw toError((response as { error: unknown }).error);
				}

				const data = (response as { data?: unknown }).data as
					| CommentListResult
					| undefined;
				return (
					data ?? {
						items: [],
						total: 0,
						limit: params?.limit ?? 20,
						offset: pageParam ?? 0,
					}
				);
			},
		}),
	});
}
