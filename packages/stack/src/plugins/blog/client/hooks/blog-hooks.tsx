"use client";

import { createApiClient } from "@btst/stack/plugins/client";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseInfiniteQuery,
	useSuspenseQuery,
	type InfiniteData,
} from "@tanstack/react-query";
import type { SerializedPost, SerializedTag } from "../../types";
import type { BlogApiRouter } from "../../api/plugin";
import { useDebounce } from "./use-debounce";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { useInView } from "react-intersection-observer";
import { createPostSchema, updatePostSchema } from "../../schemas";
import { createBlogQueryKeys } from "../../query-keys";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../overrides";

/**
 * Shared React Query configuration for all blog queries
 * Prevents automatic refetching to avoid hydration mismatches in SSR
 */
const SHARED_QUERY_CONFIG = {
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnMount: false,
	refetchOnReconnect: false,
	staleTime: 1000 * 60 * 5, // 5 minutes
	gcTime: 1000 * 60 * 10, // 10 minutes
} as const;

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const {
		tag,
		tagSlug,
		limit = 10,
		enabled = true,
		query,
		published,
	} = options;
	const queries = createBlogQueryKeys(client, headers);

	const queryParams = {
		tag,
		tagSlug,
		limit,
		query,
		published,
	};

	const basePosts = queries.posts.list(queryParams);

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = useInfiniteQuery({
		...basePosts,
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			const posts = lastPage as SerializedPost[];
			if (posts.length < limit) return undefined;
			return allPages.length * limit;
		},
		enabled: enabled && !!client,
	});

	const posts = ((
		data as InfiniteData<SerializedPost[], number> | undefined
	)?.pages?.flat() ?? []) as SerializedPost[];

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const {
		tag,
		tagSlug,
		limit = 10,
		enabled = true,
		query,
		published,
	} = options;
	const queries = createBlogQueryKeys(client, headers);

	const queryParams = { tag, tagSlug, limit, query, published };
	const basePosts = queries.posts.list(queryParams);

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
		error,
		isFetching,
	} = useSuspenseInfiniteQuery({
		...basePosts,
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			const posts = lastPage as SerializedPost[];
			if (posts.length < limit) return undefined;
			return allPages.length * limit;
		},
	});

	// Manually throw errors for Error Boundaries (per React Query Suspense docs)
	// useSuspenseQuery only throws errors if there's no data, but we want to throw always
	if (error && !isFetching) {
		throw error;
	}

	const posts = (data.pages?.flat() ?? []) as SerializedPost[];

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);

	const basePost = queries.posts.detail(slug ?? "");
	const { data, isLoading, error, refetch } = useQuery<
		SerializedPost | null,
		Error,
		SerializedPost | null,
		typeof basePost.queryKey
	>({
		...basePost,
		...SHARED_QUERY_CONFIG,
		enabled: !!client && !!slug,
	});

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);
	const basePost = queries.posts.detail(slug);
	const { data, refetch, error, isFetching } = useSuspenseQuery<
		SerializedPost | null,
		Error,
		SerializedPost | null,
		typeof basePost.queryKey
	>({
		...basePost,
		...SHARED_QUERY_CONFIG,
	});

	// Manually throw errors for Error Boundaries (per React Query Suspense docs)
	// useSuspenseQuery only throws errors if there's no data, but we want to throw always
	if (error && !isFetching) {
		throw error;
	}

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);
	const baseTags = queries.tags.list();
	const { data, isLoading, error, refetch } = useQuery<
		SerializedTag[] | null,
		Error,
		SerializedTag[] | null,
		typeof baseTags.queryKey
	>({
		...baseTags,
		...SHARED_QUERY_CONFIG,
		enabled: !!client,
	});

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
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);
	const baseTags = queries.tags.list();
	const { data, refetch, error, isFetching } = useSuspenseQuery<
		SerializedTag[] | null,
		Error,
		SerializedTag[] | null,
		typeof baseTags.queryKey
	>({
		...baseTags,
		...SHARED_QUERY_CONFIG,
	});

	// Manually throw errors for Error Boundaries (per React Query Suspense docs)
	// useSuspenseQuery only throws errors if there's no data, but we want to throw always
	if (error && !isFetching) {
		throw error;
	}

	return {
		tags: data ?? [],
		refetch,
	};
}

/** Create a new post */
export function useCreatePost() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createBlogQueryKeys(client);

	return useMutation<SerializedPost | null, Error, PostCreateInput>({
		mutationKey: [...queries.posts._def, "create"],
		mutationFn: async (postData: PostCreateInput) => {
			const response = await client("@post/posts", {
				method: "POST",
				body: postData,
			});
			return response.data as SerializedPost | null;
		},
		onSuccess: async (created) => {
			// Update detail cache if available
			if (created?.slug) {
				queryClient.setQueryData(
					queries.posts.detail(created.slug).queryKey,
					created,
				);
			}
			// Invalidate lists scoped to posts and drafts - wait for completion
			await queryClient.invalidateQueries({
				queryKey: queries.posts.list._def,
			});
			await queryClient.invalidateQueries({
				queryKey: queries.drafts.list._def,
			});
			// Refresh server-side cache (Next.js router cache)
			if (refresh) {
				await refresh();
			}
		},
	});
}

/** Update an existing post by id */
export function useUpdatePost() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<BlogPluginOverrides>("blog");

	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	const queryClient = useQueryClient();
	const queries = createBlogQueryKeys(client);

	return useMutation<
		SerializedPost | null,
		Error,
		{ id: string; data: PostUpdateInput }
	>({
		mutationKey: [...queries.posts._def, "update"],
		mutationFn: async ({ id, data }: { id: string; data: PostUpdateInput }) => {
			const response = await client(`@put/posts/:id`, {
				method: "PUT",
				params: { id },
				body: data,
			});
			return response.data as SerializedPost | null;
		},
		onSuccess: async (updated) => {
			// Update detail cache if available
			if (updated?.slug) {
				queryClient.setQueryData(
					queries.posts.detail(updated.slug).queryKey,
					updated,
				);
			}
			// Invalidate lists scoped to posts and drafts - wait for completion
			await queryClient.invalidateQueries({
				queryKey: queries.posts.list._def,
			});
			await queryClient.invalidateQueries({
				queryKey: queries.drafts.list._def,
			});
			// Refresh server-side cache (Next.js router cache)
			if (refresh) {
				await refresh();
			}
		},
	});
}

/** Delete a post by id */
export function useDeletePost() {
	const { refresh, apiBaseURL, apiBasePath } =
		usePluginOverrides<BlogPluginOverrides>("blog");

	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	const queryClient = useQueryClient();
	const queries = createBlogQueryKeys(client);

	return useMutation<{ success: boolean }, Error, { id: string }>({
		mutationKey: [...queries.posts._def, "delete"],
		mutationFn: async ({ id }: { id: string }) => {
			const response = await client(`@delete/posts/:id`, {
				method: "DELETE",
				params: { id },
			});
			return response.data as { success: boolean };
		},
		onSuccess: async () => {
			// Invalidate all post lists and detail caches - wait for completion
			await queryClient.invalidateQueries({
				queryKey: queries.posts._def,
			});
			await queryClient.invalidateQueries({
				queryKey: queries.drafts.list._def,
			});
			// Refresh server-side cache (Next.js router cache)
			if (refresh) {
				await refresh();
			}
		},
	});
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
 * Hook for fetching previous and next posts relative to a given date
 * Uses useInView to only fetch when the component is in view
 */
export function useNextPreviousPosts(
	createdAt: string | Date,
	options: UseNextPreviousPostsOptions = {},
): UseNextPreviousPostsResult & {
	ref: (node: Element | null) => void;
	inView: boolean;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);

	const { ref, inView } = useInView({
		// start a little early so the data is ready as it scrolls in
		rootMargin: "200px 0px",
		// run once; keep data cached after
		triggerOnce: true,
	});

	const dateValue =
		typeof createdAt === "string" ? new Date(createdAt) : createdAt;
	const baseQuery = queries.posts.nextPrevious(dateValue);

	const { data, isLoading, error, refetch } = useQuery<
		{ previous: SerializedPost | null; next: SerializedPost | null },
		Error,
		{ previous: SerializedPost | null; next: SerializedPost | null },
		typeof baseQuery.queryKey
	>({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: (options.enabled ?? true) && inView && !!client,
	});

	return {
		previousPost: data?.previous ?? null,
		nextPost: data?.next ?? null,
		isLoading,
		error,
		refetch,
		ref,
		inView,
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
 * Hook for fetching recent posts
 * Uses useInView to only fetch when the component is in view
 */
export function useRecentPosts(
	options: UseRecentPostsOptions = {},
): UseRecentPostsResult & {
	ref: (node: Element | null) => void;
	inView: boolean;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<BlogPluginOverrides>("blog");
	const client = createApiClient<BlogApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createBlogQueryKeys(client, headers);

	const { ref, inView } = useInView({
		// start a little early so the data is ready as it scrolls in
		rootMargin: "200px 0px",
		// run once; keep data cached after
		triggerOnce: true,
	});

	const baseQuery = queries.posts.recent({
		limit: options.limit ?? 5,
		excludeSlug: options.excludeSlug,
	});

	const { data, isLoading, error, refetch } = useQuery<
		SerializedPost[],
		Error,
		SerializedPost[],
		typeof baseQuery.queryKey
	>({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: (options.enabled ?? true) && inView && !!client,
	});

	return {
		recentPosts: data ?? [],
		isLoading,
		error,
		refetch,
		ref,
		inView,
	};
}
