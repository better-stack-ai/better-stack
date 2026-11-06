import type { DBAdapter as Adapter } from "@btst/db";
import type { Comment, CommentLike } from "../types";

class StaleCommentStateError extends Error {}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

/**
 * Normalize the affected-row shapes returned by supported DBAdapter runtimes.
 *
 * The declared adapter contract is a number, while some pinned adapters return
 * driver results and the memory adapter returns the updated row. Unknown
 * shapes fail closed rather than turning a zero-row CAS into a successful one.
 */
function hasPositiveCount(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value) && value > 0;
	if (typeof value === "bigint") return value > 0n;
	return false;
}

function isMemoryCommentRow(
	result: Record<string, unknown>,
	expectedId: string,
): boolean {
	return (
		result.id === expectedId &&
		typeof result.resourceId === "string" &&
		typeof result.resourceType === "string" &&
		typeof result.authorId === "string" &&
		typeof result.body === "string" &&
		(result.status === "pending" ||
			result.status === "approved" ||
			result.status === "spam") &&
		typeof result.likes === "number" &&
		result.createdAt instanceof Date &&
		result.updatedAt instanceof Date
	);
}

function didUpdateRows(result: unknown, expectedId: string): boolean {
	if (typeof result === "number" || typeof result === "bigint") {
		return hasPositiveCount(result);
	}
	if (!result || typeof result !== "object") return false;

	const record = result as Record<string, unknown>;
	// Postgres.js and Bun SQL attach a scalar count to their result array.
	if ("count" in record) return hasPositiveCount(record.count);
	// MySQL driver results are tuples whose affected-row header is element 0.
	// Later tuple entries are metadata and must never turn a zero count into a
	// successful authorization CAS.
	if (Array.isArray(result)) {
		return result.length > 0 && didUpdateRows(result[0], expectedId);
	}

	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return hasPositiveCount(record[key]);
	}
	// Cloudflare D1 exposes the affected-row count at meta.changes.
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				hasPositiveCount((meta as Record<string, unknown>).changes),
		);
	}
	return isMemoryCommentRow(record, expectedId);
}

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
 * @remarks **Security:** Operation authorization and lifecycle hooks are not called. The caller is
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
 * @remarks **Security:** Operation authorization and lifecycle hooks are not called. The caller is
 * responsible for authorization and lifecycle composition. Pass the complete
 * authorized `expected` snapshot to make the edit conditional and construct
 * the result without a racy post-write read.
 */
export async function updateComment(
	adapter: Adapter,
	id: string,
	body: string,
	expected?: Comment,
): Promise<Comment | null> {
	const editedAt = new Date();
	const update = {
		body,
		editedAt,
		updatedAt: editedAt,
	};
	if (!expected) {
		return adapter.update<Comment>({
			model: "comment",
			where: [{ field: "id", value: id, operator: "eq" }],
			update,
		});
	}
	if (expected.id !== id) return null;

	const matched = await adapter.updateMany({
		model: "comment",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "authorId", value: expected.authorId, operator: "eq" },
			{ field: "body", value: expected.body, operator: "eq" },
			{ field: "status", value: expected.status, operator: "eq" },
			{ field: "likes", value: expected.likes, operator: "eq" },
			{ field: "updatedAt", value: expected.updatedAt, operator: "eq" },
		],
		update,
	});
	return didUpdateRows(matched, id) ? { ...expected, ...update } : null;
}

/**
 * Update the status of a comment (approve, reject, spam).
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are not called. Callers should
 * authorize moderation before calling this lower-level data function. Pass the
 * complete authorized `expected` snapshot to make the transition conditional,
 * fail closed on concurrent changes, and avoid a racy post-write read.
 */
export async function updateCommentStatus(
	adapter: Adapter,
	id: string,
	status: "pending" | "approved" | "spam",
	expected?: Comment,
): Promise<Comment | null> {
	const updatedAt = new Date();
	const update = { status, updatedAt };
	if (!expected) {
		return adapter.update<Comment>({
			model: "comment",
			where: [{ field: "id", value: id, operator: "eq" }],
			update,
		});
	}
	if (expected.id !== id) return null;

	const matched = await adapter.updateMany({
		model: "comment",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "resourceId", value: expected.resourceId, operator: "eq" },
			{ field: "resourceType", value: expected.resourceType, operator: "eq" },
			{ field: "authorId", value: expected.authorId, operator: "eq" },
			{ field: "body", value: expected.body, operator: "eq" },
			{ field: "status", value: expected.status, operator: "eq" },
			{ field: "likes", value: expected.likes, operator: "eq" },
			{ field: "updatedAt", value: expected.updatedAt, operator: "eq" },
		],
		update,
	});
	return didUpdateRows(matched, id) ? { ...expected, ...update } : null;
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
 * @remarks **Security:** Operation authorization and lifecycle hooks are not called. Callers should
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
			if (!didUpdateRows(matched, id)) return false;
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
 * @remarks **Security:** Operation authorization and lifecycle hooks are not called. The caller is
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
				if (!didUpdateRows(updated, commentId)) {
					throw new StaleCommentStateError();
				}
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
