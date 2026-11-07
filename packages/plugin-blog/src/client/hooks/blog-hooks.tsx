"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import {
	hashKey,
	useQueryClient,
	type UseMutationResult,
} from "@tanstack/react-query";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useIdentityResolutionPromise,
	useStack,
} from "@btst/stack/context";
import type { EditorialQueryScope } from "../../api/query-key-defs";
import { BLOG_PLUGIN_ID } from "../constants";
import { z } from "zod";
import type {
	ResourceFormConfig,
	ResourceFormResult,
} from "@btst/stack/plugins/client/hooks";
import type {
	SerializedEditorialPost,
	SerializedPost,
	SerializedTag,
} from "../../types";
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

/**
 * Form lifecycle hook for creating/editing posts, built on the core
 * resource `useForm`: submits the right mutation, awaits invalidation,
 * notifies, redirects, and maps server validation issues to `fieldErrors`.
 */
export function usePostForm<TValues>(
	config: ResourceFormConfig<
		TValues,
		SerializedPost | null,
		SerializedPost | null
	>,
): ResourceFormResult<TValues, SerializedPost | null, SerializedPost | null> {
	return blog.posts.useForm<TValues, SerializedPost | null>(config);
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

export function usePostRevisions(id: string, enabled = true) {
	const result = blog.postRevisions.list.useInfinite([id], { enabled });
	return {
		...result,
		revisions: result.data?.pages.flatMap((page) => page.items) ?? [],
	};
}

export function useRestorePostRevision() {
	return blog.posts.restoreRevision.use();
}

function useEditorialScope(): EditorialQueryScope {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const { api, plugins } = useStack();
	const endpoint = plugins?.[BLOG_PLUGIN_ID]?.api ?? api;
	return {
		identity: isPending
			? `pending:${generation}`
			: error
				? `error:${generation}`
				: (identity ?? undefined),
		endpoint: {
			baseURL: endpoint?.baseURL ?? "",
			basePath: endpoint?.basePath ?? "",
		},
	};
}

function useEditorialMutation<TData, TVariables>(
	mutation: UseMutationResult<TData, Error, TVariables>,
): UseMutationResult<TData, Error, TVariables> {
	const scope = useEditorialScope();
	const { queryClient: stackQueryClient, router } = useStack();
	const queryClient = useQueryClient(stackQueryClient);
	const currentScope = useRef(scope);
	const startedScope = useRef<EditorialQueryScope | undefined>(undefined);
	const mounted = useRef(true);
	useLayoutEffect(() => {
		currentScope.current = scope;
	});
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const mutateAsync: typeof mutation.mutateAsync = async (...args) => {
		const startedAs = scope;
		startedScope.current = startedAs;
		const result = await mutation.mutateAsync(...args);
		const ownsScope = ({ queryKey }: { queryKey: readonly unknown[] }) =>
			hashKey([queryKey[3]]) === hashKey([startedAs]);
		if (
			!mounted.current ||
			hashKey([currentScope.current]) !== hashKey([startedAs])
		) {
			queryClient.removeQueries({
				queryKey: ["editorialPosts"],
				predicate: ownsScope,
			});
			return result;
		}
		await queryClient.invalidateQueries({
			queryKey: ["editorialPosts"],
			predicate: ownsScope,
			refetchType: "all",
		});
		for (const resource of ["posts", "drafts", "postRevisions", "tags"]) {
			await queryClient.invalidateQueries({ queryKey: [resource] });
		}
		await router?.refresh?.();
		return result;
	};
	return {
		...mutation,
		data:
			hashKey([startedScope.current]) === hashKey([scope])
				? mutation.data
				: undefined,
		mutateAsync,
		mutate: (...args: Parameters<typeof mutation.mutate>) => {
			void mutateAsync(...args).catch(() => {});
		},
	} as UseMutationResult<TData, Error, TVariables>;
}

/** Fetch the authorized working version separately from the public post cache. */
export function useSuspenseEditorialPost(slug: string): {
	post: SerializedEditorialPost | null;
	scopeKey: string;
	isCurrentScope: () => boolean;
	refetch: () => Promise<unknown>;
} {
	const scope = useEditorialScope();
	const currentScope = useRef(scope);
	const mounted = useRef(true);
	useLayoutEffect(() => {
		currentScope.current = scope;
	});
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const { isPending, error } = useIdentity();
	const resolution = useIdentityResolutionPromise();
	const { data, refetch } = blog.editorialPosts.detail.useSuspense([
		slug,
		scope,
	]);
	if (error) throw error;
	if (isPending) throw resolution ?? Promise.resolve();
	const isCurrentScope = () =>
		mounted.current && hashKey([currentScope.current]) === hashKey([scope]);
	return {
		post: data ?? null,
		scopeKey: hashKey([scope]),
		isCurrentScope,
		refetch: async () => {
			if (!isCurrentScope()) return;
			const result = await refetch();
			return isCurrentScope() ? result : undefined;
		},
	};
}

/** Submit the current saved revision for editorial review. */
export function useSubmitPost() {
	return useEditorialMutation(blog.editorialPosts.submit.use());
}

/** Request changes to the submitted revision. */
export function useRequestPostChanges() {
	return useEditorialMutation(blog.editorialPosts.requestChanges.use());
}

/** Approve the submitted immutable revision. */
export function useApprovePost() {
	return useEditorialMutation(blog.editorialPosts.approve.use());
}

/** Publish the approved revision, or withdraw the live post. */
export function usePublishPost() {
	return useEditorialMutation(blog.editorialPosts.publish.use());
}
