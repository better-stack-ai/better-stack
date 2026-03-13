import type { Comment, SerializedComment } from "../types";

/**
 * Serialize a raw Comment DB record into a SerializedComment for SSG/setQueryData.
 * Note: resolvedAuthorName, resolvedAvatarUrl, and isLikedByCurrentUser are not
 * available from the DB record alone — use getters.ts enrichment for those.
 * This serializer is for cases where you already have a SerializedComment from
 * the HTTP layer and just need a type-safe round-trip.
 *
 * Pure function — no DB access, no hooks.
 */
export function serializeComment(comment: Comment): Omit<
	SerializedComment,
	"resolvedAuthorName" | "resolvedAvatarUrl" | "isLikedByCurrentUser"
> & {
	resolvedAuthorName: string;
	resolvedAvatarUrl: null;
	isLikedByCurrentUser: false;
} {
	return {
		id: comment.id,
		resourceId: comment.resourceId,
		resourceType: comment.resourceType,
		parentId: comment.parentId ?? null,
		authorId: comment.authorId,
		resolvedAuthorName: "[deleted]",
		resolvedAvatarUrl: null,
		isLikedByCurrentUser: false,
		body: comment.body,
		status: comment.status,
		likes: comment.likes,
		editedAt: comment.editedAt?.toISOString() ?? null,
		createdAt: comment.createdAt.toISOString(),
		updatedAt: comment.updatedAt.toISOString(),
		replyCount: 0,
	};
}
