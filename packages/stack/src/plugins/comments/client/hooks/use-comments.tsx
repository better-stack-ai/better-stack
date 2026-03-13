"use client";

import {
	useQuery,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createApiClient } from "@btst/stack/plugins/client";
import { createCommentsQueryKeys } from "../../query-keys";
import type { CommentsApiRouter } from "../../api";
import type { SerializedComment, CommentListResult } from "../../types";

interface CommentsClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
}

function getClient(config: CommentsClientConfig) {
	return createApiClient<CommentsApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
	});
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "object" && error !== null) {
		const obj = error as Record<string, unknown>;
		const message =
			(typeof obj.message === "string" ? obj.message : null) ||
			JSON.stringify(error);
		return new Error(message);
	}
	return new Error(String(error));
}

/**
 * Fetch a paginated list of comments for a resource.
 * Returns approved comments by default.
 */
export function useComments(
	config: CommentsClientConfig,
	params: {
		resourceId?: string;
		resourceType?: string;
		parentId?: string | null;
		status?: "pending" | "approved" | "spam";
		currentUserId?: string;
		limit?: number;
		offset?: number;
	},
	options?: { enabled?: boolean },
) {
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	const query = useQuery({
		...queries.comments.list(params),
		staleTime: 30_000,
		retry: false,
		enabled: options?.enabled ?? true,
	});

	return {
		data: query.data,
		comments: query.data?.items ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * useSuspenseQuery version — for use in .internal.tsx files.
 */
export function useSuspenseComments(
	config: CommentsClientConfig,
	params: {
		resourceId?: string;
		resourceType?: string;
		parentId?: string | null;
		status?: "pending" | "approved" | "spam";
		currentUserId?: string;
		limit?: number;
		offset?: number;
	},
) {
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...queries.comments.list(params),
		staleTime: 30_000,
		retry: false,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		comments: data?.items ?? [],
		total: data?.total ?? 0,
		refetch,
	};
}

/**
 * Fetch the approved comment count for a resource.
 */
export function useCommentCount(
	config: CommentsClientConfig,
	params: {
		resourceId: string;
		resourceType: string;
		status?: "pending" | "approved" | "spam";
	},
) {
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	const query = useQuery({
		...queries.commentCount.byResource(params),
		staleTime: 60_000,
		retry: false,
	});

	return {
		count: query.data ?? 0,
		isLoading: query.isLoading,
		error: query.error,
	};
}

/**
 * Post a new comment with optimistic update.
 * When autoApprove is false the optimistic entry shows as "pending" — visible
 * only to the comment's own author via the `currentUserId` match in the UI.
 */
export function usePostComment(
	config: CommentsClientConfig,
	params: {
		resourceId: string;
		resourceType: string;
		currentUserId?: string;
	},
) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	// Compute the list key for a given parentId so optimistic updates always
	// target the exact cache entry the component is subscribed to.
	// parentId must be normalised to null (not undefined) because useComments
	// passes `parentId: null` explicitly — null and undefined produce different
	// discriminator objects and therefore different React Query cache keys.
	const getListKey = (parentId: string | null | undefined) =>
		queries.comments.list({
			resourceId: params.resourceId,
			resourceType: params.resourceType,
			parentId: parentId ?? null,
			status: "approved",
			currentUserId: params.currentUserId,
		}).queryKey;

	return useMutation({
		mutationFn: async (input: { body: string; parentId?: string | null }) => {
			const response = await client("@post/comments", {
				method: "POST",
				body: {
					resourceId: params.resourceId,
					resourceType: params.resourceType,
					parentId: input.parentId ?? null,
					body: input.body,
				},
				headers: config.headers,
			});

			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as SerializedComment;
		},
		onMutate: async (input) => {
			const listKey = getListKey(input.parentId);
			await queryClient.cancelQueries({ queryKey: listKey });
			const previous = queryClient.getQueryData<CommentListResult>(listKey);

			// Optimistic comment — shows to own author with "pending" badge
			const optimistic: SerializedComment = {
				id: `optimistic-${Date.now()}`,
				resourceId: params.resourceId,
				resourceType: params.resourceType,
				parentId: input.parentId ?? null,
				authorId: params.currentUserId ?? "",
				resolvedAuthorName: "You",
				resolvedAvatarUrl: null,
				body: input.body,
				status: "pending",
				likes: 0,
				isLikedByCurrentUser: false,
				editedAt: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				replyCount: 0,
			};

			queryClient.setQueryData<CommentListResult>(listKey, (old) => {
				if (!old) {
					return { items: [optimistic], total: 1, limit: 20, offset: 0 };
				}
				return {
					...old,
					items: [...old.items, optimistic],
					total: old.total + 1,
				};
			});

			return { previous, listKey };
		},
		onError: (_err, _input, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(context.listKey, context.previous);
			}
		},
		onSettled: (_data, _error, input) => {
			queryClient.invalidateQueries({ queryKey: getListKey(input.parentId) });
		},
	});
}

/**
 * Edit the body of an existing comment.
 */
export function useUpdateComment(config: CommentsClientConfig) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	return useMutation({
		mutationFn: async (input: { id: string; body: string }) => {
			const response = await client("@patch/comments/:id", {
				method: "PATCH",
				params: { id: input.id },
				body: { body: input.body },
				headers: config.headers,
			});
			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as SerializedComment;
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queries.comments.list._def,
			});
		},
	});
}

/**
 * Approve a comment (set status to "approved"). Admin use.
 */
export function useApproveComment(config: CommentsClientConfig) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	return useMutation({
		mutationFn: async (id: string) => {
			const response = await client("@patch/comments/:id/status", {
				method: "PATCH",
				params: { id },
				body: { status: "approved" },
				headers: config.headers,
			});
			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as SerializedComment;
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queries.comments.list._def,
			});
			queryClient.invalidateQueries({
				queryKey: queries.commentCount.byResource._def,
			});
		},
	});
}

/**
 * Update comment status (pending / approved / spam). Admin use.
 */
export function useUpdateCommentStatus(config: CommentsClientConfig) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	return useMutation({
		mutationFn: async (input: {
			id: string;
			status: "pending" | "approved" | "spam";
		}) => {
			const response = await client("@patch/comments/:id/status", {
				method: "PATCH",
				params: { id: input.id },
				body: { status: input.status },
				headers: config.headers,
			});
			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as SerializedComment;
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queries.comments.list._def,
			});
			queryClient.invalidateQueries({
				queryKey: queries.commentCount.byResource._def,
			});
		},
	});
}

/**
 * Delete a comment. Admin use.
 */
export function useDeleteComment(config: CommentsClientConfig) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	return useMutation({
		mutationFn: async (id: string) => {
			const response = await client("@delete/comments/:id", {
				method: "DELETE",
				params: { id },
				headers: config.headers,
			});
			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as { success: boolean };
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queries.comments.list._def,
			});
			queryClient.invalidateQueries({
				queryKey: queries.commentCount.byResource._def,
			});
		},
	});
}

/**
 * Toggle a like on a comment with optimistic update.
 */
export function useToggleLike(
	config: CommentsClientConfig,
	params: {
		resourceId: string;
		resourceType: string;
		/** parentId of the comment being liked — must match the parentId used by
		 *  useComments so the optimistic setQueryData hits the correct cache entry.
		 *  Pass `null` for top-level comments, or the parent comment ID for replies. */
		parentId?: string | null;
		currentUserId?: string;
	},
) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	// parentId must be normalised to null (not undefined) — same rule as usePostComment.
	const listKey = queries.comments.list({
		resourceId: params.resourceId,
		resourceType: params.resourceType,
		parentId: params.parentId ?? null,
		status: "approved",
		currentUserId: params.currentUserId,
	}).queryKey;

	return useMutation({
		mutationFn: async (input: { commentId: string; authorId: string }) => {
			const response = await client("@post/comments/:id/like", {
				method: "POST",
				params: { id: input.commentId },
				body: { authorId: input.authorId },
				headers: config.headers,
			});
			const data = (response as { data?: unknown }).data;
			if (!data) throw toError((response as { error?: unknown }).error);
			return data as { likes: number; isLiked: boolean };
		},
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: listKey });
			const previous = queryClient.getQueryData<CommentListResult>(listKey);

			queryClient.setQueryData<CommentListResult>(listKey, (old) => {
				if (!old) return old;
				return {
					...old,
					items: old.items.map((c) => {
						if (c.id !== input.commentId) return c;
						const wasLiked = c.isLikedByCurrentUser;
						return {
							...c,
							isLikedByCurrentUser: !wasLiked,
							likes: wasLiked ? Math.max(0, c.likes - 1) : c.likes + 1,
						};
					}),
				};
			});

			return { previous };
		},
		onError: (_err, _input, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(listKey, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: listKey });
		},
	});
}
