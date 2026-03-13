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

type WhereCondition = {
	field: string;
	value: string | number | boolean | Date | string[] | number[] | null;
	operator: "eq";
};

/**
 * Build the base WHERE conditions from common list params (excluding status).
 */
function buildBaseConditions(
	params: z.infer<typeof CommentListQuerySchema>,
): WhereCondition[] {
	const conditions: WhereCondition[] = [];

	if (params.resourceId) {
		conditions.push({
			field: "resourceId",
			value: params.resourceId,
			operator: "eq",
		});
	}
	if (params.resourceType) {
		conditions.push({
			field: "resourceType",
			value: params.resourceType,
			operator: "eq",
		});
	}
	if (params.parentId !== undefined) {
		const parentValue =
			params.parentId === null || params.parentId === "null"
				? null
				: params.parentId;
		conditions.push({ field: "parentId", value: parentValue, operator: "eq" });
	}
	if (params.authorId) {
		conditions.push({
			field: "authorId",
			value: params.authorId,
			operator: "eq",
		});
	}

	return conditions;
}

/**
 * List comments for a resource, optionally filtered by status and parentId.
 * Server-side resolves author display info and like status.
 *
 * When `status` is "approved" (default) and `currentUserId` is provided, the
 * result also includes the current user's own pending comments so they remain
 * visible after a page refresh without requiring admin access.
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
	const sortDirection = params.sort ?? "asc";

	// When authorId is provided and no explicit status filter is requested,
	// return all statuses (the "my comments" mode — the caller owns the data).
	// Otherwise default to "approved" to prevent leaking pending/spam to
	// unauthenticated callers.
	const omitStatusFilter = !!params.authorId && !params.status;
	const statusFilter = omitStatusFilter ? null : (params.status ?? "approved");
	const baseConditions = buildBaseConditions(params);

	let comments: Comment[];
	let total: number;

	if (
		!omitStatusFilter &&
		statusFilter === "approved" &&
		params.currentUserId
	) {
		// Fetch approved comments AND the current user's own pending comments so
		// they remain visible after a page refresh (React Query cache is lost).
		// Two separate queries are needed because the DB adapter only supports
		// AND-chained equality conditions (no OR operator).
		const [approvedRaw, ownPendingRaw] = await Promise.all([
			adapter.findMany<Comment>({
				model: "comment",
				where: [
					...baseConditions,
					{ field: "status", value: "approved", operator: "eq" },
				],
				sortBy: { field: "createdAt", direction: sortDirection },
			}),
			adapter.findMany<Comment>({
				model: "comment",
				where: [
					...baseConditions,
					{ field: "status", value: "pending", operator: "eq" },
					{ field: "authorId", value: params.currentUserId, operator: "eq" },
				],
				sortBy: { field: "createdAt", direction: sortDirection },
			}),
		]);

		// Merge — approved takes precedence if an ID somehow appears in both.
		const approvedIds = new Set(approvedRaw.map((c) => c.id));
		const merged = [
			...approvedRaw,
			...ownPendingRaw.filter((c) => !approvedIds.has(c.id)),
		];
		merged.sort((a, b) => {
			const diff = a.createdAt.getTime() - b.createdAt.getTime();
			return sortDirection === "desc" ? -diff : diff;
		});

		total = merged.length;
		comments = merged.slice(offset, offset + limit);
	} else {
		const where: WhereCondition[] = [...baseConditions];
		if (statusFilter !== null) {
			where.push({
				field: "status",
				value: statusFilter,
				operator: "eq",
			});
		}

		const [found, count] = await Promise.all([
			adapter.findMany<Comment>({
				model: "comment",
				limit,
				offset,
				where,
				sortBy: { field: "createdAt", direction: sortDirection },
			}),
			adapter.count({ model: "comment", where }),
		]);
		comments = found;
		total = count;
	}

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

	// Batch-count replies for top-level comments so the client can show the
	// expand button without firing a separate request per comment.
	// When currentUserId is provided, also count the user's own pending replies
	// so the button appears immediately after a page refresh.
	const replyCounts = new Map<string, number>();
	const isTopLevelQuery =
		params.parentId === null || params.parentId === "null";
	if (isTopLevelQuery && comments.length > 0) {
		await Promise.all(
			comments.map(async (c) => {
				const approvedCount = await adapter.count({
					model: "comment",
					where: [
						{ field: "parentId", value: c.id, operator: "eq" },
						{ field: "status", value: "approved", operator: "eq" },
					],
				});

				let ownPendingCount = 0;
				if (params.currentUserId) {
					ownPendingCount = await adapter.count({
						model: "comment",
						where: [
							{ field: "parentId", value: c.id, operator: "eq" },
							{ field: "status", value: "pending", operator: "eq" },
							{
								field: "authorId",
								value: params.currentUserId,
								operator: "eq",
							},
						],
					});
				}

				replyCounts.set(c.id, approvedCount + ownPendingCount);
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
