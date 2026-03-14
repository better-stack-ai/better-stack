/**
 * Internal query key constants for the Comments plugin.
 * Shared between query-keys.ts (HTTP path) and any SSG/direct DB path
 * to prevent key drift between loaders and prefetch calls.
 */

export interface CommentsListDiscriminator {
	resourceId: string | undefined;
	resourceType: string | undefined;
	parentId: string | null | undefined;
	status: string | undefined;
	currentUserId: string | undefined;
	authorId: string | undefined;
	sort: string | undefined;
	limit: number;
	offset: number;
}

/**
 * Builds the discriminator object for the comments list query key.
 */
export function commentsListDiscriminator(params?: {
	resourceId?: string;
	resourceType?: string;
	parentId?: string | null;
	status?: string;
	currentUserId?: string;
	authorId?: string;
	sort?: string;
	limit?: number;
	offset?: number;
}): CommentsListDiscriminator {
	return {
		resourceId: params?.resourceId,
		resourceType: params?.resourceType,
		parentId: params?.parentId,
		status: params?.status,
		currentUserId: params?.currentUserId,
		authorId: params?.authorId,
		sort: params?.sort,
		limit: params?.limit ?? 20,
		offset: params?.offset ?? 0,
	};
}

export interface CommentCountDiscriminator {
	resourceId: string;
	resourceType: string;
	status: string | undefined;
}

export function commentCountDiscriminator(params: {
	resourceId: string;
	resourceType: string;
	status?: string;
}): CommentCountDiscriminator {
	return {
		resourceId: params.resourceId,
		resourceType: params.resourceType,
		status: params.status,
	};
}

/**
 * Discriminator for the infinite thread query (top-level comments only).
 * Intentionally excludes `offset` — pages are driven by `pageParam`, not the key.
 */
export interface CommentsThreadDiscriminator {
	resourceId: string | undefined;
	resourceType: string | undefined;
	parentId: string | null | undefined;
	status: string | undefined;
	currentUserId: string | undefined;
	limit: number;
}

export function commentsThreadDiscriminator(params?: {
	resourceId?: string;
	resourceType?: string;
	parentId?: string | null;
	status?: string;
	currentUserId?: string;
	limit?: number;
}): CommentsThreadDiscriminator {
	return {
		resourceId: params?.resourceId,
		resourceType: params?.resourceType,
		parentId: params?.parentId,
		status: params?.status,
		currentUserId: params?.currentUserId,
		limit: params?.limit ?? 20,
	};
}

/** Full query key builders — use with queryClient.setQueryData() */
export const COMMENTS_QUERY_KEYS = {
	/**
	 * Key for comments list query.
	 * Full key: ["comments", "list", { resourceId, resourceType, parentId, status, currentUserId, limit, offset }]
	 */
	commentsList: (params?: {
		resourceId?: string;
		resourceType?: string;
		parentId?: string | null;
		status?: string;
		currentUserId?: string;
		authorId?: string;
		sort?: string;
		limit?: number;
		offset?: number;
	}) => ["comments", "list", commentsListDiscriminator(params)] as const,

	/**
	 * Key for a single comment detail query.
	 * Full key: ["comments", "detail", id]
	 */
	commentDetail: (id: string) => ["comments", "detail", id] as const,

	/**
	 * Key for comment count query.
	 * Full key: ["comments", "count", { resourceId, resourceType, status }]
	 */
	commentCount: (params: {
		resourceId: string;
		resourceType: string;
		status?: string;
	}) => ["comments", "count", commentCountDiscriminator(params)] as const,

	/**
	 * Key for the infinite thread query (top-level comments, load-more).
	 * Full key: ["commentsThread", "list", { resourceId, resourceType, parentId, status, currentUserId, limit }]
	 * Offset is excluded — it is driven by `pageParam`, not baked into the key.
	 */
	commentsThread: (params?: {
		resourceId?: string;
		resourceType?: string;
		parentId?: string | null;
		status?: string;
		currentUserId?: string;
		limit?: number;
	}) =>
		["commentsThread", "list", commentsThreadDiscriminator(params)] as const,
};
