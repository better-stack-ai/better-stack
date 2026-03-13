import type { DBAdapter as Adapter } from "@btst/db";
import type {
	Comment,
	CommentLike,
	CommentListResult,
	SerializedComment,
} from "../types";
import type { z } from "zod";
import type {
	CommentListQuerySchema,
	CommentCountQuerySchema,
} from "../schemas";

/**
 * Resolve display info for a batch of authorIds using the consumer-supplied resolveUser hook.
 * Deduplicates lookups — each unique authorId is resolved only once per call.
 *
 * @remarks **Security:** No authorization hooks are called. The caller is responsible for
 * any access-control checks before invoking this function.
 */
async function resolveAuthors(
	authorIds: string[],
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>,
): Promise<Map<string, { name: string; avatarUrl: string | null }>> {
	const unique = [...new Set(authorIds)];
	const map = new Map<string, { name: string; avatarUrl: string | null }>();

	if (!resolveUser || unique.length === 0) {
		for (const id of unique) {
			map.set(id, { name: "[deleted]", avatarUrl: null });
		}
		return map;
	}

	await Promise.all(
		unique.map(async (id) => {
			try {
				const result = await resolveUser(id);
				map.set(id, {
					name: result?.name ?? "[deleted]",
					avatarUrl: result?.avatarUrl ?? null,
				});
			} catch {
				map.set(id, { name: "[deleted]", avatarUrl: null });
			}
		}),
	);

	return map;
}

/**
 * Serialize a raw Comment from the DB into a SerializedComment for the API response.
 * Enriches with resolved author info and like status.
 */
function enrichComment(
	comment: Comment,
	authorMap: Map<string, { name: string; avatarUrl: string | null }>,
	likedCommentIds: Set<string>,
	replyCount = 0,
): SerializedComment {
	const author = authorMap.get(comment.authorId) ?? {
		name: "[deleted]",
		avatarUrl: null,
	};
	return {
		id: comment.id,
		resourceId: comment.resourceId,
		resourceType: comment.resourceType,
		parentId: comment.parentId ?? null,
		authorId: comment.authorId,
		resolvedAuthorName: author.name,
		resolvedAvatarUrl: author.avatarUrl,
		body: comment.body,
		status: comment.status,
		likes: comment.likes,
		isLikedByCurrentUser: likedCommentIds.has(comment.id),
		editedAt: comment.editedAt?.toISOString() ?? null,
		createdAt: comment.createdAt.toISOString(),
		updatedAt: comment.updatedAt.toISOString(),
		replyCount,
	};
}

/**
 * List comments for a resource, optionally filtered by status and parentId.
 * Server-side resolves author display info and like status.
 *
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @param adapter - The database adapter
 * @param params - Filter/pagination parameters
 * @param resolveUser - Optional consumer hook to resolve author display info
 */
export async function listComments(
	adapter: Adapter,
	params: z.infer<typeof CommentListQuerySchema>,
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>,
): Promise<CommentListResult> {
	const limit = params.limit ?? 20;
	const offset = params.offset ?? 0;

	const whereConditions: Array<{
		field: string;
		value: string | number | boolean | Date | string[] | number[] | null;
		operator: "eq";
	}> = [];

	if (params.resourceId) {
		whereConditions.push({
			field: "resourceId",
			value: params.resourceId,
			operator: "eq",
		});
	}
	if (params.resourceType) {
		whereConditions.push({
			field: "resourceType",
			value: params.resourceType,
			operator: "eq",
		});
	}
	// Default to "approved" when no status is provided so that omitting the
	// parameter never leaks pending/spam comments to unauthenticated callers.
	const statusFilter = params.status ?? "approved";
	whereConditions.push({
		field: "status",
		value: statusFilter,
		operator: "eq",
	});
	// When parentId is explicitly null we want top-level comments only
	if (params.parentId !== undefined) {
		if (params.parentId === null || params.parentId === "null") {
			whereConditions.push({
				field: "parentId",
				value: null,
				operator: "eq",
			});
		} else {
			whereConditions.push({
				field: "parentId",
				value: params.parentId,
				operator: "eq",
			});
		}
	}

	const where = whereConditions.length > 0 ? whereConditions : undefined;

	const [comments, total] = await Promise.all([
		adapter.findMany<Comment>({
			model: "comment",
			limit,
			offset,
			where,
			sortBy: { field: "createdAt", direction: "asc" },
		}),
		adapter.count({ model: "comment", where }),
	]);

	// Resolve author display info server-side
	const authorIds = comments.map((c) => c.authorId);
	const authorMap = await resolveAuthors(authorIds, resolveUser);

	// Resolve like status for currentUserId (if provided)
	const likedCommentIds = new Set<string>();
	if (params.currentUserId && comments.length > 0) {
		const commentIds = comments.map((c) => c.id);
		// Fetch all likes by the currentUser for these comments
		const likes = await Promise.all(
			commentIds.map((commentId) =>
				adapter.findOne<CommentLike>({
					model: "commentLike",
					where: [
						{ field: "commentId", value: commentId, operator: "eq" },
						{
							field: "authorId",
							value: params.currentUserId!,
							operator: "eq",
						},
					],
				}),
			),
		);
		likes.forEach((like, i) => {
			if (like) likedCommentIds.add(commentIds[i]!);
		});
	}

	// Batch-count approved replies for top-level comments so the client can
	// show the expand button without firing a separate request per comment.
	const replyCounts = new Map<string, number>();
	const isTopLevelQuery =
		params.parentId === null || params.parentId === "null";
	if (isTopLevelQuery && comments.length > 0) {
		await Promise.all(
			comments.map(async (c) => {
				const count = await adapter.count({
					model: "comment",
					where: [
						{ field: "parentId", value: c.id, operator: "eq" },
						{ field: "status", value: "approved", operator: "eq" },
					],
				});
				replyCounts.set(c.id, count);
			}),
		);
	}

	const items = comments.map((c) =>
		enrichComment(c, authorMap, likedCommentIds, replyCounts.get(c.id) ?? 0),
	);

	return { items, total, limit, offset };
}

/**
 * Get a single comment by ID, enriched with author info.
 * Returns null if not found.
 *
 * Pure DB function — no hooks, no HTTP context.
 */
export async function getCommentById(
	adapter: Adapter,
	id: string,
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>,
	currentUserId?: string,
): Promise<SerializedComment | null> {
	const comment = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});

	if (!comment) return null;

	const authorMap = await resolveAuthors([comment.authorId], resolveUser);

	const likedCommentIds = new Set<string>();
	if (currentUserId) {
		const like = await adapter.findOne<CommentLike>({
			model: "commentLike",
			where: [
				{ field: "commentId", value: id, operator: "eq" },
				{ field: "authorId", value: currentUserId, operator: "eq" },
			],
		});
		if (like) likedCommentIds.add(id);
	}

	return enrichComment(comment, authorMap, likedCommentIds);
}

/**
 * Count comments for a resource, optionally filtered by status.
 *
 * Pure DB function — no hooks, no HTTP context.
 */
export async function getCommentCount(
	adapter: Adapter,
	params: z.infer<typeof CommentCountQuerySchema>,
): Promise<number> {
	const whereConditions: Array<{
		field: string;
		value: string | number | boolean | Date | string[] | number[] | null;
		operator: "eq";
	}> = [
		{ field: "resourceId", value: params.resourceId, operator: "eq" },
		{ field: "resourceType", value: params.resourceType, operator: "eq" },
	];

	// Default to "approved" when no status is provided so that omitting the
	// parameter never leaks pending/spam counts to unauthenticated callers.
	const statusFilter = params.status ?? "approved";
	whereConditions.push({
		field: "status",
		value: statusFilter,
		operator: "eq",
	});

	return adapter.count({ model: "comment", where: whereConditions });
}
