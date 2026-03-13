/**
 * Comment status values
 */
export type CommentStatus = "pending" | "approved" | "spam";

/**
 * A comment record as stored in the database
 */
export type Comment = {
	id: string;
	resourceId: string;
	resourceType: string;
	parentId: string | null;
	authorId: string;
	body: string;
	status: CommentStatus;
	likes: number;
	editedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * A like record linking an author to a comment
 */
export type CommentLike = {
	id: string;
	commentId: string;
	authorId: string;
	createdAt: Date;
};

/**
 * A comment enriched with server-resolved author info and like status.
 * All dates are ISO strings (safe for serialisation over HTTP / React Query cache).
 */
export interface SerializedComment {
	id: string;
	resourceId: string;
	resourceType: string;
	parentId: string | null;
	authorId: string;
	/** Resolved from resolveUser(authorId). Falls back to "[deleted]" when user cannot be found. */
	resolvedAuthorName: string;
	/** Resolved avatar URL or null */
	resolvedAvatarUrl: string | null;
	body: string;
	status: CommentStatus;
	/** Denormalized counter — updated atomically on toggleLike */
	likes: number;
	/** True when the currentUserId query param matches an existing commentLike row */
	isLikedByCurrentUser: boolean;
	/** ISO string set when the comment body was edited; null for unedited comments */
	editedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Paginated list result for comments
 */
export interface CommentListResult {
	items: SerializedComment[];
	total: number;
	limit: number;
	offset: number;
}
