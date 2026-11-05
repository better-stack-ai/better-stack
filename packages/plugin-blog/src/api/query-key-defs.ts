/**
 * Internal query key constants for the blog plugin.
 * Shared between query-keys.ts (HTTP path) and prefetchForRoute (DB path)
 * to prevent key drift between SSR loaders and SSG prefetching.
 */

export interface PostsListDiscriminator {
	query: string | undefined;
	limit: number;
	published: boolean;
	tagSlug: string | undefined;
}

/**
 * Builds the discriminator object used as the cache key for the posts list.
 * Mirrors the inline object in createPostsQueries so both paths stay in sync.
 */
export function postsListDiscriminator(params: {
	published: boolean;
	limit?: number;
	tagSlug?: string;
	query?: string;
}): PostsListDiscriminator {
	return {
		query:
			params.query !== undefined && params.query.trim() === ""
				? undefined
				: params.query,
		limit: params.limit ?? 10,
		published: params.published,
		tagSlug: params.tagSlug,
	};
}

/** Full query key builders — use these with queryClient.setQueryData() */
export const BLOG_QUERY_KEYS = {
	postsList: (params: {
		published: boolean;
		limit?: number;
		tagSlug?: string;
	}) => ["posts", "list", postsListDiscriminator(params)] as const,

	postDetail: (slug: string) => ["posts", "detail", slug] as const,

	tagsList: () => ["tags", "list", "tags"] as const,
};
