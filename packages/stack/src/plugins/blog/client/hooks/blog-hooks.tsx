"use client";

import { useEffect, useRef } from "react";
import { z } from "zod";
import type { SerializedPost, SerializedTag } from "../../types";
import type { createPostSchema, updatePostSchema } from "../../schemas";
import { useDebounce } from "./use-debounce";
import { blog } from "./blog-resource";

/**
 * Options for the usePosts hook
 */
export interface UsePostsOptions {
	/** Filter posts by tag name */
	tag?: string;
	/** Filter posts by tag slug */
	tagSlug?: string;
	/** Number of posts to fetch per page (default: 10) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
	/** Search query to filter posts by title, content, or excerpt */
	query?: string;
	/** Filter by published status */
	published?: boolean;
	/** Filter by specific post slug */
	slug?: string;
}

/**
 * Result from the usePosts hook
 */
export interface UsePostsResult {
	/** Array of fetched posts */
	posts: SerializedPost[];
	/** Whether the initial load is in progress */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to load the next page of posts */
	loadMore: () => void;
	/** Whether there are more posts to load */
	hasMore: boolean;
	/** Whether the next page is being loaded */
	isLoadingMore: boolean;
	/** Function to refetch the posts */
	refetch: () => void;
}

/**
 * Options for the usePostSearch hook
 */
export interface UsePostSearchOptions {
	/** Search query string to filter posts */
	query: string;
	/** Whether to enable the search query (default: true) */
	enabled?: boolean;
	/** Debounce delay in milliseconds (default: 300) */
	debounceMs?: number;
	/** Number of results to return (default: 10) */
	limit?: number;
	/** Filter by published status (default: true) */
	published?: boolean;
}

/**
 * Result from the usePostSearch hook
 */
export interface UsePostSearchResult {
	/** Array of posts matching the search query */
	posts: SerializedPost[];
	/** Alias for posts (React Query compatibility) */
	data: SerializedPost[];
	/** Whether the search is in progress */
	isLoading: boolean;
	/** Error if the search failed */
	error: Error | null;
	/** Function to refetch the search results */
	refetch: () => void;
	/** Whether a search is currently in progress (includes debounce time) */
	isSearching: boolean;
	/** The debounced search query being used */
	searchQuery: string;
}

/**
 * Result from the usePost hook
 */
export interface UsePostResult {
	/** The fetched post, or null if not found */
	post: SerializedPost | null;
	/** Whether the post is being loaded */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to refetch the post */
	refetch: () => void;
}

/** Input type for creating a new post */
export type PostCreateInput = z.infer<typeof createPostSchema>;
/** Input type for updating an existing post */
export type PostUpdateInput = z.infer<typeof updatePostSchema>;

/**
 * Hook for fetching paginated posts with load more functionality
 */
export function usePosts(options: UsePostsOptions = {}): UsePostsResult {
	const { tagSlug, limit = 10, enabled = true, query, published } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = blog.posts.list.useInfinite([{ tagSlug, limit, query, published }], {
		enabled,
	});

	const posts = data?.pages?.flat() ?? [];

	return {
		posts,
		isLoading,
		error,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/** Suspense variant of usePosts */
export function useSuspensePosts(options: UsePostsOptions = {}): {
	posts: SerializedPost[];
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { tagSlug, limit = 10, query, published } = options;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		blog.posts.list.useSuspenseInfinite([{ tagSlug, limit, query, published }]);

	const posts = data.pages?.flat() ?? [];

	return {
		posts,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Hook for fetching a single post by slug
 */
export function usePost(slug?: string): UsePostResult {
	const { data, isLoading, error, refetch } = blog.posts.detail.use(
		[slug ?? ""],
		{ enabled: !!slug },
	);

	return {
		post: data || null,
		isLoading,
		error,
		refetch,
	};
}

/** Suspense variant of usePost */
export function useSuspensePost(slug: string): {
	post: SerializedPost | null;
	refetch: () => Promise<unknown>;
} {
	const { data, refetch } = blog.posts.detail.useSuspense([slug]);

	return { post: data || null, refetch };
}

/**
 * Hook for fetching all unique tags across posts
 */
export function useTags(): {
	tags: SerializedTag[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { data, isLoading, error, refetch } = blog.tags.list.use([]);

	return {
		tags: data ?? [],
		isLoading,
		error,
		refetch,
	};
}

/** Suspense variant of useTags */
export function useSuspenseTags(): {
	tags: SerializedTag[];
	refetch: () => Promise<unknown>;
} {
	const { data, refetch } = blog.tags.list.useSuspense([]);

	return {
		tags: data ?? [],
		refetch,
	};
}

/** Create a new post */
export function useCreatePost() {
	return blog.posts.create.use();
}

/** Update an existing post by id */
export function useUpdatePost() {
	return blog.posts.update.use();
}

/** Delete a post by id */
export function useDeletePost() {
	return blog.posts.delete.use();
}

/**
 * Hook for searching posts by a free-text query. Uses `usePosts` under the hood.
 * Debounces the query and preserves last successful results to avoid flicker.
 */
export function usePostSearch({
	query,
	enabled = true,
	debounceMs = 300,
	limit = 10,
	published = true,
}: UsePostSearchOptions): UsePostSearchResult {
	const debouncedQuery = useDebounce(query, debounceMs);
	const shouldSearch = enabled && (query?.trim().length ?? 0) > 0;

	const lastResultsRef = useRef<SerializedPost[]>([]);

	// Only enable the query when there is an actual search term
	// This prevents empty searches from using the base posts query
	const { posts, isLoading, error, refetch } = usePosts({
		query: debouncedQuery,
		limit,
		enabled: shouldSearch && debouncedQuery.trim() !== "",
		published,
	});

	// If search is disabled or query is empty, always return empty results
	const effectivePosts = shouldSearch ? posts : [];

	useEffect(() => {
		if (!isLoading && posts && posts.length >= 0) {
			lastResultsRef.current = posts;
		}
	}, [posts, isLoading]);

	const isDebouncing = enabled && debounceMs > 0 && debouncedQuery !== query;
	const effectiveLoading = isLoading || isDebouncing;
	// During loading, use the last results
	// For empty searches or when disabled, use empty array
	const dataToReturn = !shouldSearch
		? []
		: effectiveLoading
			? lastResultsRef.current
			: effectivePosts;

	return {
		posts: dataToReturn,
		// compatibility alias similar to tanstack useQuery
		data: dataToReturn,
		isLoading: effectiveLoading,
		error,
		refetch,
		isSearching: effectiveLoading,
		searchQuery: debouncedQuery,
	};
}

/**
 * Options for the useNextPreviousPosts hook
 */
export interface UseNextPreviousPostsOptions {
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Result from the useNextPreviousPosts hook
 */
export interface UseNextPreviousPostsResult {
	/** The previous post (older), or null if none exists */
	previousPost: SerializedPost | null;
	/** The next post (newer), or null if none exists */
	nextPost: SerializedPost | null;
	/** Whether the query is loading */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to refetch the posts */
	refetch: () => void;
}

/**
 * Hook for fetching previous and next posts relative to a given date.
 * Pair with `<WhenVisible>` in the render tree for lazy loading.
 */
export function useNextPreviousPosts(
	createdAt: string | Date,
	options: UseNextPreviousPostsOptions = {},
): UseNextPreviousPostsResult {
	const dateValue =
		typeof createdAt === "string" ? new Date(createdAt) : createdAt;

	const { data, isLoading, error, refetch } = blog.posts.nextPrevious.use(
		[dateValue],
		{ enabled: options.enabled ?? true },
	);

	return {
		previousPost: data?.previous ?? null,
		nextPost: data?.next ?? null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Options for the useRecentPosts hook
 */
export interface UseRecentPostsOptions {
	/** Maximum number of recent posts to fetch (default: 5) */
	limit?: number;
	/** Slug of a post to exclude from results */
	excludeSlug?: string;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Result from the useRecentPosts hook
 */
export interface UseRecentPostsResult {
	/** Array of recent posts */
	recentPosts: SerializedPost[];
	/** Whether the query is loading */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to refetch the posts */
	refetch: () => void;
}

/**
 * Hook for fetching recent posts.
 * Pair with `<WhenVisible>` in the render tree for lazy loading.
 */
export function useRecentPosts(
	options: UseRecentPostsOptions = {},
): UseRecentPostsResult {
	const { data, isLoading, error, refetch } = blog.posts.recent.use(
		[{ limit: options.limit ?? 5, excludeSlug: options.excludeSlug }],
		{ enabled: options.enabled ?? true },
	);

	return {
		recentPosts: data ?? [],
		isLoading,
		error,
		refetch,
	};
}
