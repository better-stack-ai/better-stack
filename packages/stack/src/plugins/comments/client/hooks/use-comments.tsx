"use client";

import {
	useQuery,
	useInfiniteQuery,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
	type InfiniteData,
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
		authorId?: string;
		sort?: "asc" | "desc";
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
		authorId?: string;
		sort?: "asc" | "desc";
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
 * Infinite-scroll variant for the CommentThread component.
 * Uses the "commentsThread" factory namespace (separate from the plain
 * useComments / useSuspenseComments queries) to avoid InfiniteData shape conflicts.
 *
 * Mirrors the blog's usePosts pattern: spread the factory base query into
 * useInfiniteQuery, drive pages via pageParam, and derive hasMore from server total.
 */
export function useInfiniteComments(
	config: CommentsClientConfig,
	params: {
		resourceId: string;
		resourceType: string;
		parentId?: string | null;
		status?: "pending" | "approved" | "spam";
		currentUserId?: string;
		pageSize?: number;
	},
	options?: { enabled?: boolean },
) {
	const pageSize = params.pageSize ?? 10;
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	const baseQuery = queries.commentsThread.list({
		resourceId: params.resourceId,
		resourceType: params.resourceType,
		parentId: params.parentId ?? null,
		status: params.status,
		currentUserId: params.currentUserId,
		limit: pageSize,
	});

	const query = useInfiniteQuery<
		CommentListResult,
		Error,
		InfiniteData<CommentListResult>,
		typeof baseQuery.queryKey,
		number
	>({
		...baseQuery,
		initialPageParam: 0,
		getNextPageParam: (lastPage) => {
			const nextOffset = lastPage.offset + lastPage.limit;
			return nextOffset < lastPage.total ? nextOffset : undefined;
		},
		staleTime: 30_000,
		retry: false,
		enabled: options?.enabled ?? true,
	});

	const comments = query.data?.pages.flatMap((p) => p.items) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;

	return {
		comments,
		total,
		queryKey: baseQuery.queryKey,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		loadMore: query.fetchNextPage,
		hasMore: !!query.hasNextPage,
		isLoadingMore: query.isFetchingNextPage,
		error: query.error,
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
 *
 * Pass `infiniteKey` (from `useInfiniteComments`) when the thread uses an
 * infinite query so the optimistic update targets InfiniteData<CommentListResult>
 * instead of a plain CommentListResult cache entry.
 */
export function usePostComment(
	config: CommentsClientConfig,
	params: {
		resourceId: string;
		resourceType: string;
		currentUserId?: string;
		/** When provided, optimistic updates target this infinite-query cache key. */
		infiniteKey?: readonly unknown[];
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
	const getListKey = (parentId: string | null | undefined) => {
		// Top-level posts for a thread using useInfiniteComments get the infinite key.
		if (params.infiniteKey && (parentId ?? null) === null) {
			return params.infiniteKey;
		}
		return queries.comments.list({
			resourceId: params.resourceId,
			resourceType: params.resourceType,
			parentId: parentId ?? null,
			status: "approved",
			currentUserId: params.currentUserId,
		}).queryKey;
	};

	const isInfinitePost = (parentId: string | null | undefined) =>
		!!params.infiniteKey && (parentId ?? null) === null;

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

			// Optimistic comment — shows to own author with "pending" badge
			const optimisticId = `optimistic-${Date.now()}`;
			const optimistic: SerializedComment = {
				id: optimisticId,
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

			if (isInfinitePost(input.parentId)) {
				const previous =
					queryClient.getQueryData<InfiniteData<CommentListResult>>(listKey);

				queryClient.setQueryData<InfiniteData<CommentListResult>>(
					listKey,
					(old) => {
						if (!old) {
							return {
								pages: [
									{ items: [optimistic], total: 1, limit: 10, offset: 0 },
								],
								pageParams: [0],
							};
						}
						const lastIdx = old.pages.length - 1;
						return {
							...old,
							pages: old.pages.map((page, idx) =>
								idx === lastIdx
									? {
											...page,
											items: [...page.items, optimistic],
											total: page.total + 1,
										}
									: page,
							),
						};
					},
				);

				return { previous, isInfinite: true as const, listKey, optimisticId };
			}

			const previous = queryClient.getQueryData<CommentListResult>(listKey);
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

			return { previous, isInfinite: false as const, listKey, optimisticId };
		},
		onSuccess: (data, _input, context) => {
			if (!context) return;
			// Replace the optimistic item with the real server response.
			// The server may return status "pending" (autoApprove: false) or "approved"
			// (autoApprove: true). Either way we keep the item in the cache so the
			// author continues to see their comment — with a "Pending approval" badge
			// when pending. Without this, the onSettled invalidation would refetch
			// only approved comments and make the pending entry disappear.
			if (context.isInfinite) {
				queryClient.setQueryData<InfiniteData<CommentListResult>>(
					context.listKey,
					(old) => {
						if (!old) return old;
						return {
							...old,
							pages: old.pages.map((page) => ({
								...page,
								items: page.items.map((item) =>
									item.id === context.optimisticId ? data : item,
								),
							})),
						};
					},
				);
			} else {
				queryClient.setQueryData<CommentListResult>(context.listKey, (old) => {
					if (!old) return old;
					return {
						...old,
						items: old.items.map((item) =>
							item.id === context.optimisticId ? data : item,
						),
					};
				});
			}
		},
		onError: (_err, _input, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(context.listKey, context.previous);
			}
		},
		// No onSettled list invalidation — the mutation response is the ground
		// truth. Invalidating would trigger a server refetch that returns only
		// approved comments, erasing a pending optimistic entry from the cache.
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
			// Also invalidate the infinite thread cache so edits are reflected there.
			queryClient.invalidateQueries({ queryKey: ["commentsThread"] });
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
			// Also invalidate the infinite thread cache so deletions are reflected there.
			queryClient.invalidateQueries({ queryKey: ["commentsThread"] });
		},
	});
}

/**
 * Toggle a like on a comment with optimistic update.
 *
 * Pass `infiniteKey` (from `useInfiniteComments`) for top-level thread comments
 * so the optimistic update targets InfiniteData<CommentListResult> instead of
 * a plain CommentListResult cache entry.
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
		/** When the comment lives in an infinite thread, pass the thread's query key
		 *  so the optimistic update targets the correct InfiniteData cache entry. */
		infiniteKey?: readonly unknown[];
	},
) {
	const queryClient = useQueryClient();
	const client = getClient(config);
	const queries = createCommentsQueryKeys(client, config.headers);

	// For top-level thread comments use the infinite key; for replies (or when no
	// infinite key is supplied) fall back to the regular list cache entry.
	const isInfinite = !!params.infiniteKey && (params.parentId ?? null) === null;
	const listKey = isInfinite
		? params.infiniteKey!
		: queries.comments.list({
				resourceId: params.resourceId,
				resourceType: params.resourceType,
				parentId: params.parentId ?? null,
				status: "approved",
				currentUserId: params.currentUserId,
			}).queryKey;

	function applyLikeUpdate(
		commentId: string,
		updater: (c: SerializedComment) => SerializedComment,
	) {
		if (isInfinite) {
			queryClient.setQueryData<InfiniteData<CommentListResult>>(
				listKey,
				(old) => {
					if (!old) return old;
					return {
						...old,
						pages: old.pages.map((page) => ({
							...page,
							items: page.items.map((c) =>
								c.id === commentId ? updater(c) : c,
							),
						})),
					};
				},
			);
		} else {
			queryClient.setQueryData<CommentListResult>(listKey, (old) => {
				if (!old) return old;
				return {
					...old,
					items: old.items.map((c) => (c.id === commentId ? updater(c) : c)),
				};
			});
		}
	}

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

			// Snapshot previous state for rollback.
			const previous = isInfinite
				? queryClient.getQueryData<InfiniteData<CommentListResult>>(listKey)
				: queryClient.getQueryData<CommentListResult>(listKey);

			applyLikeUpdate(input.commentId, (c) => {
				const wasLiked = c.isLikedByCurrentUser;
				return {
					...c,
					isLikedByCurrentUser: !wasLiked,
					likes: wasLiked ? Math.max(0, c.likes - 1) : c.likes + 1,
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
