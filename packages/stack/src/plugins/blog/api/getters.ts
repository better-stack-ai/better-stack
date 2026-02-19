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
 * Retrieve all posts matching optional filter criteria.
 * Pure DB function - no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters (same shape as the list API query)
 */
export async function getAllPosts(
	adapter: Adapter,
	params?: PostListParams,
): Promise<Array<Post & { tags: Tag[] }>> {
	const query = params ?? {};

	let tagFilterPostIds: Set<string> | null = null;

	if (query.tagSlug) {
		const tag = await adapter.findOne<Tag>({
			model: "tag",
			where: [
				{
					field: "slug",
					value: query.tagSlug,
					operator: "eq" as const,
				},
			],
		});

		if (!tag) {
			return [];
		}

		const postTags = await adapter.findMany<{ postId: string; tagId: string }>({
			model: "postTag",
			where: [
				{
					field: "tagId",
					value: tag.id,
					operator: "eq" as const,
				},
			],
		});
		tagFilterPostIds = new Set(postTags.map((pt) => pt.postId));
		if (tagFilterPostIds.size === 0) {
			return [];
		}
	}

	const whereConditions = [];

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

	const posts = await adapter.findMany<PostWithPostTag>({
		model: "post",
		limit: query.query || query.tagSlug ? undefined : (query.limit ?? 10),
		offset: query.query || query.tagSlug ? undefined : (query.offset ?? 0),
		where: whereConditions,
		sortBy: {
			field: "createdAt",
			direction: "desc",
		},
		join: {
			postTag: true,
		},
	});

	// Collect unique tag IDs
	const tagIds = new Set<string>();
	for (const post of posts) {
		if (post.postTag) {
			for (const pt of post.postTag) {
				tagIds.add(pt.tagId);
			}
		}
	}

	// Fetch all tags at once
	const tags =
		tagIds.size > 0
			? await adapter.findMany<Tag>({
					model: "tag",
				})
			: [];
	const tagMap = new Map<string, Tag>();
	for (const tag of tags) {
		if (tagIds.has(tag.id)) {
			tagMap.set(tag.id, tag);
		}
	}

	// Map tags to posts
	let result = posts.map((post) => {
		const postTags = (post.postTag || [])
			.map((pt) => {
				const tag = tagMap.get(pt.tagId);
				return tag ? { ...tag } : undefined;
			})
			.filter((tag): tag is Tag => tag !== undefined);
		const { postTag: _, ...postWithoutJoin } = post;
		return {
			...postWithoutJoin,
			tags: postTags,
		};
	});

	if (tagFilterPostIds) {
		result = result.filter((post) => tagFilterPostIds!.has(post.id));
	}

	if (query.query) {
		const searchLower = query.query.toLowerCase();
		result = result.filter((post) => {
			const titleMatch = post.title?.toLowerCase().includes(searchLower);
			const contentMatch = post.content?.toLowerCase().includes(searchLower);
			const excerptMatch = post.excerpt?.toLowerCase().includes(searchLower);
			return titleMatch || contentMatch || excerptMatch;
		});
	}

	if (query.tagSlug || query.query) {
		const offset = query.offset ?? 0;
		const limit = query.limit ?? 10;
		result = result.slice(offset, offset + limit);
	}

	return result;
}

/**
 * Retrieve a single post by its slug, including associated tags.
 * Returns null if no post is found.
 *
 * @param adapter - The database adapter
 * @param slug - The post slug
 */
export async function getPostBySlug(
	adapter: Adapter,
	slug: string,
): Promise<(Post & { tags: Tag[] }) | null> {
	const results = await getAllPosts(adapter, { slug });
	return results[0] ?? null;
}

/**
 * Retrieve all tags.
 *
 * @param adapter - The database adapter
 */
export async function getAllTags(adapter: Adapter): Promise<Tag[]> {
	return adapter.findMany<Tag>({
		model: "tag",
	});
}
