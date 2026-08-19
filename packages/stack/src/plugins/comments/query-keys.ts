import type { CommentsApiRouter } from "./api";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { CommentListResult, SerializedComment } from "./types";
import {
	commentsListDiscriminator,
	commentCountDiscriminator,
	commentsThreadDiscriminator,
} from "./api/query-key-defs";

export interface CommentsListParams {
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

export interface CommentCountParams {
	resourceId: string;
	resourceType: string;
	status?: "pending" | "approved" | "spam";
}

/** Params for the infinite thread query (offset is driven by `pageParam`). */
export interface CommentsThreadParams {
	resourceId?: string;
	resourceType?: string;
	parentId?: string | null;
	status?: "pending" | "approved" | "spam";
	currentUserId?: string;
	sort?: "asc" | "desc";
	limit?: number;
}

/** Input for the create-comment mutation (`authorId` is resolved server-side). */
export interface CreateCommentInput {
	resourceId: string;
	resourceType: string;
	parentId?: string | null;
	body: string;
}

/**
 * Comments resource declaration — the single source of truth for query keys
 * and HTTP mappings. Feeds `createCommentsQueryKeys` (SSR loaders and the
 * client hooks in `client/hooks/use-comments.tsx`).
 *
 * Key shapes intentionally match the discriminators in
 * `api/query-key-defs.ts` so SSG/loader prefetch hydration keeps working.
 *
 * `currentUserId` is intentionally NOT sent to the server in any query.
 * The server resolves the caller's identity server-side via the
 * `resolveCurrentUserId` hook. Sending it would allow any caller to
 * impersonate another user and read their pending comments. It is still
 * included in the query keys for client-side cache segregation (different
 * users get different cache entries).
 *
 * Mutations declare only the HTTP mapping (path/method/input/select).
 * Cache behavior (optimistic updates, invalidation) lives in the wrapper
 * hooks in `use-comments.tsx`: the public comments hooks take an explicit
 * client config — required by the embeddable `CommentThread` — so they
 * cannot use the overrides-bound `createResource` mutation hooks.
 */
export const commentsResources = {
	comments: {
		queries: {
			list: {
				path: "/comments",
				query: (params?: CommentsListParams) => ({
					resourceId: params?.resourceId,
					resourceType: params?.resourceType,
					parentId: params?.parentId === null ? "null" : params?.parentId,
					status: params?.status,
					authorId: params?.authorId,
					sort: params?.sort,
					limit: params?.limit ?? 20,
					offset: params?.offset ?? 0,
				}),
				key: (params?: CommentsListParams) => [
					commentsListDiscriminator(params),
				],
				select: (data: any, _params?: CommentsListParams): CommentListResult =>
					data ?? { items: [], total: 0, limit: 20, offset: 0 },
			},
		},

		mutations: {
			create: {
				path: "@post/comments",
				method: "POST" as const,
				input: (vars: CreateCommentInput) => ({
					body: {
						resourceId: vars.resourceId,
						resourceType: vars.resourceType,
						parentId: vars.parentId ?? null,
						body: vars.body,
					},
				}),
				select: (data: any) => data as SerializedComment,
			},
			update: {
				path: "@patch/comments/:id",
				method: "PATCH" as const,
				input: (vars: { id: string; body: string }) => ({
					params: { id: vars.id },
					body: { body: vars.body },
				}),
				select: (data: any) => data as SerializedComment,
			},
			updateStatus: {
				path: "@patch/comments/:id/status",
				method: "PATCH" as const,
				input: (vars: {
					id: string;
					status: "pending" | "approved" | "spam";
				}) => ({
					params: { id: vars.id },
					body: { status: vars.status },
				}),
				select: (data: any) => data as SerializedComment,
			},
			delete: {
				path: "@delete/comments/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
			},
			like: {
				path: "@post/comments/:id/like",
				method: "POST" as const,
				input: (vars: { commentId: string; authorId: string }) => ({
					params: { id: vars.commentId },
					body: { authorId: vars.authorId },
				}),
				select: (data: any) => data as { likes: number; isLiked: boolean },
			},
		},
	},

	commentCount: {
		queries: {
			byResource: {
				path: "/comments/count",
				query: (params: CommentCountParams) => ({
					resourceId: params.resourceId,
					resourceType: params.resourceType,
					status: params.status,
				}),
				key: (params: CommentCountParams) => [
					commentCountDiscriminator(params),
				],
				select: (data: any, _params: CommentCountParams): number =>
					data?.count ?? 0,
			},
		},
	},

	commentsThread: {
		queries: {
			// Offset is excluded from the key — it is driven by `pageParam`
			// (injected per page by the infinite queryFn).
			list: {
				path: "/comments",
				query: (params?: CommentsThreadParams) => ({
					resourceId: params?.resourceId,
					resourceType: params?.resourceType,
					parentId: params?.parentId === null ? "null" : params?.parentId,
					status: params?.status,
					sort: params?.sort,
					limit: params?.limit ?? 20,
				}),
				key: (params?: CommentsThreadParams) => [
					commentsThreadDiscriminator(params),
				],
				select: (data: any, params?: CommentsThreadParams): CommentListResult =>
					data ?? {
						items: [],
						total: 0,
						limit: params?.limit ?? 20,
						offset: 0,
					},
				infinite: true,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createCommentsQueryKeys(
	client: ReturnType<typeof createApiClient<CommentsApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, commentsResources, headers);
}
