import type { DBAdapter as Adapter } from "@btst/db";
import type { Comment, CommentLike } from "../types";

class StaleCommentStateError extends Error {}

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
 * responsible for authorization and lifecycle composition before invoking
 * this lower-level data function.
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
 * responsible for authorization and lifecycle composition. Pass the
 * authorized `expected` ownership and status to make the edit conditional.
 */
export async function updateComment(
	adapter: Adapter,
	id: string,
	body: string,
	expected?: Pick<Comment, "authorId" | "status">,
): Promise<Comment | null> {
	const updated = await adapter.updateMany({
		model: "comment",
		where: [
			{ field: "id", value: id, operator: "eq" },
			...(expected
				? [
						{
							field: "authorId",
							value: expected.authorId,
							operator: "eq" as const,
						},
						{
							field: "status",
							value: expected.status,
							operator: "eq" as const,
						},
					]
				: []),
		],
		update: {
			body,
			editedAt: new Date(),
			updatedAt: new Date(),
		},
	});
	if (!updated) return null;
	return adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}

/**
 * Update the status of a comment (approve, reject, spam).
 *
 * @remarks **Security:** No authorization hooks are called. Callers should
 * authorize moderation before calling this lower-level data function. Pass
 * the authorized `expected` state to make the transition conditional and
 * fail closed when concurrent work changes the row.
 */
export async function updateCommentStatus(
	adapter: Adapter,
	id: string,
	status: "pending" | "approved" | "spam",
	expected?: Pick<Comment, "resourceId" | "resourceType" | "status">,
): Promise<Comment | null> {
	const updated = await adapter.updateMany({
		model: "comment",
		where: [
			{ field: "id", value: id, operator: "eq" },
			...(expected
				? [
						{
							field: "resourceId",
							value: expected.resourceId,
							operator: "eq" as const,
						},
						{
							field: "resourceType",
							value: expected.resourceType,
							operator: "eq" as const,
						},
						{
							field: "status",
							value: expected.status,
							operator: "eq" as const,
						},
					]
				: []),
		],
		update: { status, updatedAt: new Date() },
	});
	if (!updated) return null;
	return adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}

async function deleteCommentTree(
	adapter: Pick<Adapter, "delete">,
	id: string,
): Promise<void> {
	// Remove child replies first so they don't become orphans. Their
	// commentLike rows are cleaned up by the FK cascade on commentLike.commentId.
	await adapter.delete({
		model: "comment",
		where: [{ field: "parentId", value: id, operator: "eq" }],
	});
	await adapter.delete({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}

/**
 * Delete a comment by ID, cascading to any child replies.
 *
 * Replies reference the parent via `parentId`. Because the schema declares no
 * DB-level cascade on `comment.parentId`, orphaned replies must be removed here
 * in the application layer. `commentLike` rows are covered by the FK cascade
 * on `commentLike.commentId` (declared in `db.ts`).
 *
 * Comments are only one level deep (the UI prevents replying to replies), so a
 * single-level cascade is sufficient — no recursive walk is needed.
 *
 * @remarks **Security:** No authorization hooks are called. Callers should
 * ensure the requesting user has permission to delete this comment. Pass the
 * authorized `expected` ownership to make deletion conditional.
 */
export async function deleteComment(
	adapter: Adapter,
	id: string,
	expected?: Pick<Comment, "authorId">,
): Promise<boolean> {
	if (expected) {
		return adapter.transaction(async (tx) => {
			const matched = await tx.updateMany({
				model: "comment",
				where: [
					{ field: "id", value: id, operator: "eq" },
					{ field: "authorId", value: expected.authorId, operator: "eq" },
				],
				update: { updatedAt: new Date() },
			});
			if (!matched) return false;
			await deleteCommentTree(tx, id);
			return true;
		});
	}

	const existing = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!existing) return false;
	await adapter.transaction((tx) => deleteCommentTree(tx, id));
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
 * responsible for ensuring the requesting user is authenticated (authorId is
 * valid). Pass the authorized `expected` status to fail closed if visibility
 * changes before the reaction is committed.
 */
export function toggleCommentLike(
	adapter: Adapter,
	commentId: string,
	authorId: string,
): Promise<{ likes: number; isLiked: boolean }>;
export function toggleCommentLike(
	adapter: Adapter,
	commentId: string,
	authorId: string,
	expected: Pick<Comment, "status">,
): Promise<{ likes: number; isLiked: boolean } | null>;
export async function toggleCommentLike(
	adapter: Adapter,
	commentId: string,
	authorId: string,
	expected?: Pick<Comment, "status">,
): Promise<{ likes: number; isLiked: boolean } | null> {
	try {
		return await adapter.transaction(async (tx) => {
			const comment = await tx.findOne<Comment>({
				model: "comment",
				where: [
					{ field: "id", value: commentId, operator: "eq" },
					...(expected
						? [
								{
									field: "status",
									value: expected.status,
									operator: "eq" as const,
								},
							]
						: []),
				],
			});
			if (!comment) {
				if (expected) return null;
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

			if (expected) {
				const updated = await tx.updateMany({
					model: "comment",
					where: [
						{ field: "id", value: commentId, operator: "eq" },
						{ field: "status", value: expected.status, operator: "eq" },
					],
					update: { likes: newLikes, updatedAt: new Date() },
				});
				if (!updated) throw new StaleCommentStateError();
			} else {
				await tx.update<Comment>({
					model: "comment",
					where: [{ field: "id", value: commentId, operator: "eq" }],
					update: { likes: newLikes, updatedAt: new Date() },
				});
			}

			return { likes: newLikes, isLiked };
		});
	} catch (error) {
		if (error instanceof StaleCommentStateError) return null;
		throw error;
	}
}
