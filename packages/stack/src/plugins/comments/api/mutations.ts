import type { DBAdapter as Adapter } from "@btst/db";
import type { Comment, CommentLike } from "../types";

/**
 * Input for creating a new comment.
 */
export interface CreateCommentInput {
	resourceId: string;
	resourceType: string;
	parentId?: string | null;
	authorId: string;
	body: string;
	status?: "pending" | "approved" | "spam";
}

/**
 * Create a new comment.
 *
 * @remarks **Security:** No authorization hooks are called. The caller is
 * responsible for any access-control checks (e.g., onBeforePost) before
 * invoking this function.
 */
export async function createComment(
	adapter: Adapter,
	input: CreateCommentInput,
): Promise<Comment> {
	return adapter.create<Comment>({
		model: "comment",
		data: {
			resourceId: input.resourceId,
			resourceType: input.resourceType,
			parentId: input.parentId ?? null,
			authorId: input.authorId,
			body: input.body,
			status: input.status ?? "pending",
			likes: 0,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

/**
 * Update the body of an existing comment and set editedAt.
 *
 * @remarks **Security:** No authorization hooks are called. The caller is
 * responsible for ensuring the requesting user owns the comment (onBeforeEdit).
 */
export async function updateComment(
	adapter: Adapter,
	id: string,
	body: string,
): Promise<Comment | null> {
	const existing = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!existing) return null;

	return adapter.update<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			body,
			editedAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

/**
 * Update the status of a comment (approve, reject, spam).
 *
 * @remarks **Security:** No authorization hooks are called. Callers should
 * ensure the requesting user has moderation privileges.
 */
export async function updateCommentStatus(
	adapter: Adapter,
	id: string,
	status: "pending" | "approved" | "spam",
): Promise<Comment | null> {
	const existing = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!existing) return null;

	return adapter.update<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { status, updatedAt: new Date() },
	});
}

/**
 * Delete a comment by ID.
 *
 * @remarks **Security:** No authorization hooks are called. Callers should
 * ensure the requesting user has permission to delete this comment.
 */
export async function deleteComment(
	adapter: Adapter,
	id: string,
): Promise<boolean> {
	const existing = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!existing) return false;

	await adapter.delete({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	return true;
}

/**
 * Toggle a like on a comment for a given authorId.
 * - If the user has not liked the comment: creates a commentLike row and increments the likes counter.
 * - If the user has already liked the comment: deletes the commentLike row and decrements the likes counter.
 * Returns the updated likes count.
 *
 * All reads and writes are performed inside a single transaction to prevent
 * concurrent requests from causing counter drift or duplicate like rows.
 *
 * @remarks **Security:** No authorization hooks are called. The caller is
 * responsible for ensuring the requesting user is authenticated (authorId is valid).
 */
export async function toggleCommentLike(
	adapter: Adapter,
	commentId: string,
	authorId: string,
): Promise<{ likes: number; isLiked: boolean }> {
	return adapter.transaction(async (tx) => {
		const comment = await tx.findOne<Comment>({
			model: "comment",
			where: [{ field: "id", value: commentId, operator: "eq" }],
		});
		if (!comment) {
			throw new Error("Comment not found");
		}

		const existingLike = await tx.findOne<CommentLike>({
			model: "commentLike",
			where: [
				{ field: "commentId", value: commentId, operator: "eq" },
				{ field: "authorId", value: authorId, operator: "eq" },
			],
		});

		let newLikes: number;
		let isLiked: boolean;

		if (existingLike) {
			// Unlike
			await tx.delete({
				model: "commentLike",
				where: [
					{ field: "commentId", value: commentId, operator: "eq" },
					{ field: "authorId", value: authorId, operator: "eq" },
				],
			});
			newLikes = Math.max(0, comment.likes - 1);
			isLiked = false;
		} else {
			// Like
			await tx.create<CommentLike>({
				model: "commentLike",
				data: {
					commentId,
					authorId,
					createdAt: new Date(),
				},
			});
			newLikes = comment.likes + 1;
			isLiked = true;
		}

		await tx.update<Comment>({
			model: "comment",
			where: [{ field: "id", value: commentId, operator: "eq" }],
			update: { likes: newLikes, updatedAt: new Date() },
		});

		return { likes: newLikes, isLiked };
	});
}
