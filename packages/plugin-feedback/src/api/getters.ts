import type { DBAdapter as Adapter } from "@btst/db";
import type {
	ChangelogEntry,
	ChangelogEntryRecord,
	FeedbackListParams,
	FeedbackPost,
	FeedbackPostRecord,
	FeedbackRoadmap,
	FeedbackVote,
} from "../types";

/** Adapter operations available inside a Feedback transaction or direct data read. */
export type FeedbackDataAdapter = Omit<Adapter, "transaction">;

/**
 * Read a stored request by ID.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function getFeedbackPostRecord(
	adapter: FeedbackDataAdapter,
	id: string,
) {
	return adapter.findOne<FeedbackPostRecord>({
		model: "feedbackPost",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
/**
 * Read a stored request by its public slug.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function getFeedbackPostBySlug(
	adapter: FeedbackDataAdapter,
	slug: string,
) {
	return adapter.findOne<FeedbackPostRecord>({
		model: "feedbackPost",
		where: [{ field: "slug", value: slug, operator: "eq" }],
	});
}
/**
 * Serialize a request and resolve the supplied user’s vote state.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function serializeFeedbackPost(
	adapter: FeedbackDataAdapter,
	row: FeedbackPostRecord,
	userId?: string,
): Promise<FeedbackPost> {
	const vote = userId
		? await adapter.findOne<FeedbackVote>({
				model: "feedbackVote",
				where: [
					{
						field: "key",
						value: JSON.stringify([row.id, userId]),
						operator: "eq",
					},
				],
			})
		: null;
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		body: row.body,
		category: row.category,
		status: row.status,
		authorId: row.authorId,
		kanbanTaskId: row.kanbanTaskId ?? null,
		voteCount: row.voteCount,
		isVoted: Boolean(vote),
		createdAt: new Date(row.createdAt).toISOString(),
		updatedAt: new Date(row.updatedAt).toISOString(),
	};
}
/**
 * Read requests ordered by votes with category, status and pagination filters.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function listFeedbackPosts(
	adapter: FeedbackDataAdapter,
	params: FeedbackListParams = {},
	userId?: string,
) {
	const where = [
		...(params.category
			? [{ field: "category", value: params.category, operator: "eq" as const }]
			: []),
		...(params.status
			? [{ field: "status", value: params.status, operator: "eq" as const }]
			: []),
	];
	const [rows, total] = await Promise.all([
		adapter.findMany<FeedbackPostRecord>({
			model: "feedbackPost",
			where,
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
			sortBy: { field: "voteCount", direction: "desc" },
		}),
		adapter.count({ model: "feedbackPost", where }),
	]);
	return {
		items: await Promise.all(
			rows.map((row) => serializeFeedbackPost(adapter, row, userId)),
		),
		total,
	};
}
/**
 * Read all planned, in-progress and shipped requests.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function getFeedbackRoadmap(
	adapter: FeedbackDataAdapter,
	userId?: string,
): Promise<FeedbackRoadmap> {
	const result: FeedbackRoadmap = { planned: [], in_progress: [], shipped: [] };
	for (const status of ["planned", "in_progress", "shipped"] as const) {
		let offset = 0;
		for (;;) {
			const page = await listFeedbackPosts(
				adapter,
				{ status, limit: 100, offset },
				userId,
			);
			result[status].push(...page.items);
			offset += page.items.length;
			if (offset >= page.total || !page.items.length) break;
		}
	}
	return result;
}
/**
 * Serialize a release note and resolve its linked requests.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function serializeChangelogEntry(
	adapter: FeedbackDataAdapter,
	row: ChangelogEntryRecord,
	userId?: string,
): Promise<ChangelogEntry> {
	const records = await Promise.all(
		(JSON.parse(row.postIds) as string[]).map((id) =>
			getFeedbackPostRecord(adapter, id),
		),
	);
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		publishedAt: new Date(row.publishedAt).toISOString(),
		createdAt: new Date(row.createdAt).toISOString(),
		posts: await Promise.all(
			records
				.filter((post): post is FeedbackPostRecord => Boolean(post))
				.map((post) => serializeFeedbackPost(adapter, post, userId)),
		),
	};
}
/**
 * Read published release notes in descending publication order.
 * No operation validation, authorization or lifecycle hooks run; callers own those concerns.
 */
export async function listChangelogEntries(
	adapter: FeedbackDataAdapter,
	params: { limit?: number; offset?: number } = {},
	userId?: string,
) {
	const [rows, total] = await Promise.all([
		adapter.findMany<ChangelogEntryRecord>({
			model: "changelogEntry",
			limit: params.limit ?? 50,
			offset: params.offset ?? 0,
			sortBy: { field: "publishedAt", direction: "desc" },
		}),
		adapter.count({ model: "changelogEntry" }),
	]);
	return {
		items: await Promise.all(
			rows.map((row) => serializeChangelogEntry(adapter, row, userId)),
		),
		total,
	};
}

/** Read all voter identities for server-side lifecycle integrations. Callers own authorization. */
export async function getFeedbackVoterIds(
	adapter: FeedbackDataAdapter,
	postId: string,
): Promise<string[]> {
	const ids: string[] = [];
	for (let offset = 0; ; offset += 100) {
		const votes = await adapter.findMany<FeedbackVote>({
			model: "feedbackVote",
			where: [{ field: "postId", value: postId, operator: "eq" }],
			limit: 100,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		ids.push(...votes.map((vote) => vote.userId));
		if (votes.length < 100) return ids;
	}
}
