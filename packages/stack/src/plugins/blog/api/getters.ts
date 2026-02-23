import type { Adapter } from "@btst/db";
import type { Post, PostWithPostTag, Tag } from "../types";

/**
 * Parameters for filtering/paginating posts.
 * Mirrors the shape of the list API query schema.
 */
export interface PostListParams {
	slug?: string;
	tagSlug?: string;
	offset?: number;
	limit?: number;
	query?: string;
	published?: boolean;
}

/**
 * Paginated result returned by {@link getAllPosts}.
 */
export interface PostListResult {
	items: Array<Post & { tags: Tag[] }>;
	total: number;
	limit?: number;
	offset?: number;
}

/**
 * Retrieve all posts matching optional filter criteria.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeListPosts`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters (same shape as the list API query)
 */
export async function getAllPosts(
	adapter: Adapter,
	params?: PostListParams,
): Promise<PostListResult> {
	const query = params ?? {};

	const whereConditions: Array<{
		field: string;
		value: string | number | boolean | string[] | number[] | Date | null;
		operator: "eq" | "in";
	}> = [];

	// Resolve tagSlug → post IDs up front, then push an `in` condition so the
	// adapter can filter and paginate entirely at the DB level.  The previous
	// approach loaded every post into memory and filtered with a JS Set, which
	// scans the whole table on every request.
	if (query.tagSlug) {
		const tag = await adapter.findOne<Tag>({
			model: "tag",
			where: [{ field: "slug", value: query.tagSlug, operator: "eq" as const }],
		});

		if (!tag) {
			return { items: [], total: 0, limit: query.limit, offset: query.offset };
		}

		const postTags = await adapter.findMany<{ postId: string; tagId: string }>({
			model: "postTag",
			where: [{ field: "tagId", value: tag.id, operator: "eq" as const }],
		});

		const taggedPostIds = postTags.map((pt) => pt.postId);
		if (taggedPostIds.length === 0) {
			return { items: [], total: 0, limit: query.limit, offset: query.offset };
		}

		whereConditions.push({
			field: "id",
			value: taggedPostIds,
			operator: "in" as const,
		});
	}

	if (query.published !== undefined) {
		whereConditions.push({
			field: "published",
			value: query.published,
			operator: "eq" as const,
		});
	}

	if (query.slug) {
		whereConditions.push({
			field: "slug",
			value: query.slug,
			operator: "eq" as const,
		});
	}

	// Full-text search across title/content/excerpt must remain in-memory:
	// the adapter's `contains` operator is case-sensitive and cannot be
	// grouped with AND conditions using OR connectors in all adapter
	// implementations.  All other filters above are pushed to DB, so the
	// in-memory pass only scans the already-narrowed result set.
	const needsInMemoryFilter = !!query.query;

	const dbWhere = whereConditions.length > 0 ? whereConditions : undefined;

	const dbTotal: number | undefined = !needsInMemoryFilter
		? await adapter.count({ model: "post", where: dbWhere })
		: undefined;

	const posts = await adapter.findMany<PostWithPostTag>({
		model: "post",
		limit: !needsInMemoryFilter ? query.limit : undefined,
		offset: !needsInMemoryFilter ? query.offset : undefined,
		where: dbWhere,
		sortBy: { field: "createdAt", direction: "desc" },
		join: { postTag: true },
	});

	// Collect the unique tag IDs present in this page of posts, then fetch
	// only those tags (not the entire tags table).
	const tagIds = new Set<string>();
	for (const post of posts) {
		if (post.postTag) {
			for (const pt of post.postTag) {
				tagIds.add(pt.tagId);
			}
		}
	}

	const tags =
		tagIds.size > 0
			? await adapter.findMany<Tag>({
					model: "tag",
					where: [
						{
							field: "id",
							value: Array.from(tagIds),
							operator: "in" as const,
						},
					],
				})
			: [];
	const tagMap = new Map<string, Tag>(tags.map((t) => [t.id, t]));

	let result = posts.map((post) => {
		const postTags = (post.postTag || [])
			.map((pt) => {
				const tag = tagMap.get(pt.tagId);
				return tag ? { ...tag } : undefined;
			})
			.filter((tag): tag is Tag => tag !== undefined);
		const { postTag: _, ...postWithoutJoin } = post;
		return { ...postWithoutJoin, tags: postTags };
	});

	if (query.query) {
		const searchLower = query.query.toLowerCase();
		result = result.filter(
			(post) =>
				post.title?.toLowerCase().includes(searchLower) ||
				post.content?.toLowerCase().includes(searchLower) ||
				post.excerpt?.toLowerCase().includes(searchLower),
		);
	}

	if (needsInMemoryFilter) {
		const total = result.length;
		const offset = query.offset ?? 0;
		const limit = query.limit;
		result = result.slice(
			offset,
			limit !== undefined ? offset + limit : undefined,
		);
		return { items: result, total, limit: query.limit, offset: query.offset };
	}

	return {
		items: result,
		total: dbTotal ?? result.length,
		limit: query.limit,
		offset: query.offset,
	};
}

/**
 * Retrieve a single post by its slug, including associated tags.
 * Returns null if no post is found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param slug - The post slug
 */
export async function getPostBySlug(
	adapter: Adapter,
	slug: string,
): Promise<(Post & { tags: Tag[] }) | null> {
	const posts = await adapter.findMany<PostWithPostTag>({
		model: "post",
		where: [{ field: "slug", value: slug, operator: "eq" as const }],
		limit: 1,
		join: { postTag: true },
	});

	if (posts.length === 0) return null;

	const post = posts[0]!;
	const tagIds = (post.postTag || []).map((pt) => pt.tagId);

	const tags =
		tagIds.length > 0
			? await adapter.findMany<Tag>({
					model: "tag",
					where: [{ field: "id", value: tagIds, operator: "in" as const }],
				})
			: [];

	const tagMap = new Map<string, Tag>(tags.map((t) => [t.id, t]));
	const resolvedTags = (post.postTag || [])
		.map((pt) => tagMap.get(pt.tagId))
		.filter((t): t is Tag => t !== undefined);

	const { postTag: _, ...postWithoutJoin } = post;
	return { ...postWithoutJoin, tags: resolvedTags };
}

/**
 * Retrieve all tags, sorted alphabetically by name.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 */
export async function getAllTags(adapter: Adapter): Promise<Tag[]> {
	return adapter.findMany<Tag>({
		model: "tag",
		sortBy: { field: "name", direction: "asc" },
	});
}
