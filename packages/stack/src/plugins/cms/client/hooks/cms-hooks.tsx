"use client";

import {
	useQuery,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
	useInfiniteQuery,
	useSuspenseInfiniteQuery,
	type InfiniteData,
} from "@tanstack/react-query";
import { createApiClient } from "@btst/stack/plugins/client";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSApiRouter } from "../../api";
import type {
	SerializedContentType,
	SerializedContentItemWithType,
	PaginatedContentItems,
} from "../../types";
import type { CMSPluginOverrides } from "../overrides";
import { createCMSQueryKeys } from "../../query-keys";

// Type guard for better-call error responses
function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	if (typeof response !== "object" || response === null) {
		return false;
	}
	const obj = response as Record<string, unknown>;
	return "error" in obj && obj.error !== null && obj.error !== undefined;
}

// Helper to convert error to a proper Error object with meaningful message
function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			(typeof errorObj.error === "string" ? errorObj.error : null) ||
			JSON.stringify(error);

		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}

	return new Error(String(error));
}

/**
 * Shared React Query configuration for all CMS queries
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

// ========== Content Types Hooks ==========

export interface UseContentTypesResult {
	contentTypes: (SerializedContentType & { itemCount: number })[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * Hook for fetching all content types
 */
export function useContentTypes(): UseContentTypesResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsTypes.list();

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	return {
		contentTypes: data ?? [],
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useContentTypes
 */
export function useSuspenseContentTypes(): {
	contentTypes: (SerializedContentType & { itemCount: number })[];
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsTypes.list();

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		contentTypes: data ?? [],
		refetch,
	};
}

/**
 * Hook for fetching a single content type by slug
 */
export function useContentType(slug: string): {
	contentType: SerializedContentType | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsTypes.detail(slug);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!slug,
	});

	return {
		contentType: data ?? null,
		isLoading,
		error,
		refetch,
	};
}

// ========== Content Items Hooks ==========

export interface UseContentOptions {
	/** Number of items per page (default: 10) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Result type for useContent hook with load more functionality
 * @template TData - The type of parsedData (defaults to Record<string, unknown>)
 */
export interface UseContentResult<TData = Record<string, unknown>> {
	/** Array of all loaded content items */
	items: SerializedContentItemWithType<TData>[];
	/** Total number of items available */
	total: number;
	/** Whether the initial load is in progress */
	isLoading: boolean;
	/** Error if the query failed */
	error: Error | null;
	/** Function to load the next page of items */
	loadMore: () => void;
	/** Whether there are more items to load */
	hasMore: boolean;
	/** Whether the next page is being loaded */
	isLoadingMore: boolean;
	/** Function to refetch all items */
	refetch: () => void;
}

/**
 * Hook for fetching paginated content items with load more functionality.
 * Uses React Query's infinite query for efficient pagination.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 *
 * @example
 * ```typescript
 * // Without type safety (backward compatible)
 * const { items, loadMore, hasMore, isLoadingMore } = useContent("product")
 *
 * // With type safety using a type map
 * type MyCMSTypes = {
 *   product: { name: string; price: number }
 *   testimonial: { author: string; quote: string }
 * }
 * const { items, loadMore, hasMore } = useContent<MyCMSTypes, "product">("product")
 * // items[0].parsedData.name is string
 * // items[0].parsedData.price is number
 * ```
 */
export function useContent<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	options: UseContentOptions = {},
): UseContentResult<TMap[TSlug]> {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const { limit = 10, enabled = true } = options;

	const baseQuery = queries.cmsContent.list({ typeSlug, limit, offset: 0 });

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = useInfiniteQuery({
		queryKey: baseQuery.queryKey,
		queryFn: async ({ pageParam = 0 }) => {
			const response: unknown = await client("/content/:typeSlug", {
				method: "GET",
				params: { typeSlug },
				query: { limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedContentItems<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			// Defensive check: ensure lastPage exists and has expected structure
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedContentItems)?.items;
			// If no items or fewer items than limit, we've reached the end
			if (!Array.isArray(items) || items.length < limit) return undefined;
			// Calculate total items loaded so far
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedContentItems)?.items)
						? (page as PaginatedContentItems).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedContentItems)?.total ?? 0;
			// Check if we've loaded all items
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
		enabled: enabled && !!typeSlug,
	});

	const pages = (
		data as InfiniteData<PaginatedContentItems<TMap[TSlug]>, number> | undefined
	)?.pages;
	const items = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<TMap[TSlug]>[];
	const total = pages?.[0]?.total ?? 0;

	return {
		items,
		total,
		isLoading,
		error,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Suspense variant of useContent with load more functionality.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 */
export function useSuspenseContent<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	options: UseContentOptions = {},
): {
	items: SerializedContentItemWithType<TMap[TSlug]>[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const { limit = 10 } = options;

	const baseQuery = queries.cmsContent.list({ typeSlug, limit, offset: 0 });

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
		error,
		isFetching,
	} = useSuspenseInfiniteQuery({
		queryKey: baseQuery.queryKey,
		queryFn: async ({ pageParam = 0 }) => {
			const response: unknown = await client("/content/:typeSlug", {
				method: "GET",
				params: { typeSlug },
				query: { limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedContentItems<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			// Defensive check: ensure lastPage exists and has expected structure
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedContentItems)?.items;
			// If no items or fewer items than limit, we've reached the end
			if (!Array.isArray(items) || items.length < limit) return undefined;
			// Calculate total items loaded so far
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedContentItems)?.items)
						? (page as PaginatedContentItems).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedContentItems)?.total ?? 0;
			// Check if we've loaded all items
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
	});

	// Manually throw errors for Error Boundaries (per React Query Suspense docs)
	if (error && !isFetching) {
		throw error;
	}

	const pages = data.pages as PaginatedContentItems<TMap[TSlug]>[];
	const items = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<TMap[TSlug]>[];
	const total = pages?.[0]?.total ?? 0;

	return {
		items,
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Hook for fetching a single content item by ID with optional type safety.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 *
 * @example
 * ```typescript
 * type MyCMSTypes = { product: { name: string; price: number } }
 * const { item } = useContentItem<MyCMSTypes, "product">("product", "some-id")
 * // item?.parsedData.name is string
 * ```
 */
export function useContentItem<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	id: string,
): {
	item: SerializedContentItemWithType<TMap[TSlug]> | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsContent.detail(typeSlug, id);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!typeSlug && !!id,
	});

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]>) ?? null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useContentItem with optional type safety.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 */
export function useSuspenseContentItem<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	id: string,
): {
	item: SerializedContentItemWithType<TMap[TSlug]> | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsContent.detail(typeSlug, id);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]>) ?? null,
		refetch,
	};
}

/**
 * Hook for fetching a content item by slug with optional type safety.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 *
 * @example
 * ```typescript
 * type MyCMSTypes = { product: { name: string; price: number } }
 * const { item } = useContentItemBySlug<MyCMSTypes, "product">("product", "my-product")
 * // item?.parsedData.price is number
 * ```
 */
export function useContentItemBySlug<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	slug: string,
): {
	item: SerializedContentItemWithType<TMap[TSlug]> | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const baseQuery = queries.cmsContent.bySlug(typeSlug, slug);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!typeSlug && !!slug,
	});

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]>) ?? null,
		isLoading,
		error,
		refetch,
	};
}

// ========== Mutation Hooks ==========

/**
 * Hook for creating a content item with optional type safety.
 *
 * @template TData - The type of the content data (defaults to Record<string, unknown>)
 *
 * @example
 * ```typescript
 * type ProductData = { name: string; price: number }
 * const createProduct = useCreateContent<ProductData>("product")
 *
 * // TypeScript will enforce the correct shape
 * createProduct.mutate({
 *   slug: "my-product",
 *   data: { name: "Widget", price: 29.99 }
 * })
 * ```
 */
export function useCreateContent<TData = Record<string, unknown>>(
	typeSlug: string,
) {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);

	return useMutation<
		SerializedContentItemWithType<TData>,
		Error,
		{ slug: string; data: TData }
	>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "create"],
		mutationFn: async (data) => {
			const response: unknown = await client("@post/content/:typeSlug", {
				method: "POST",
				params: { typeSlug },
				body: data as { slug: string; data: Record<string, unknown> },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown })
				.data as SerializedContentItemWithType<TData>;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.cmsContent.list._def,
				refetchType: "all",
			});
			await queryClient.invalidateQueries({
				queryKey: queries.cmsTypes.list._def,
				refetchType: "all",
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for updating a content item with optional type safety.
 *
 * @template TData - The type of the content data (defaults to Record<string, unknown>)
 *
 * @example
 * ```typescript
 * type ProductData = { name: string; price: number }
 * const updateProduct = useUpdateContent<ProductData>("product")
 *
 * updateProduct.mutate({
 *   id: "item-id",
 *   data: { data: { name: "Updated Widget", price: 39.99 } }
 * })
 * ```
 */
export function useUpdateContent<TData = Record<string, unknown>>(
	typeSlug: string,
) {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);

	return useMutation<
		SerializedContentItemWithType<TData>,
		Error,
		{ id: string; data: { slug?: string; data?: TData } }
	>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "update"],
		mutationFn: async ({ id, data }) => {
			const response: unknown = await client("@put/content/:typeSlug/:id", {
				method: "PUT",
				params: { typeSlug, id },
				body: data as { slug?: string; data?: Record<string, unknown> },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown })
				.data as SerializedContentItemWithType<TData>;
		},
		onSuccess: async (updated) => {
			if (updated) {
				queryClient.setQueryData(
					queries.cmsContent.detail(typeSlug, updated.id).queryKey,
					updated,
				);
			}
			await queryClient.invalidateQueries({
				queryKey: queries.cmsContent.list._def,
				refetchType: "all",
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for deleting a content item
 */
export function useDeleteContent(typeSlug: string) {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);

	return useMutation<{ success: boolean }, Error, string>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "delete"],
		mutationFn: async (id) => {
			const response: unknown = await client("@delete/content/:typeSlug/:id", {
				method: "DELETE",
				params: { typeSlug, id },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as { success: boolean };
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.cmsContent._def,
			});
			await queryClient.invalidateQueries({
				queryKey: queries.cmsTypes.list._def,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

// ========== Relation Hooks ==========

/**
 * Content item with populated relations
 */
export interface ContentItemWithRelations<TData = Record<string, unknown>>
	extends SerializedContentItemWithType<TData> {
	_relations?: Record<string, SerializedContentItemWithType[]>;
}

/**
 * Hook for fetching a content item with its relations populated.
 * Use this when you need to display related items alongside the main item.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 *
 * @example
 * ```typescript
 * type MyCMSTypes = {
 *   resource: { name: string; categoryIds: Array<{ id: string }> }
 *   category: { name: string }
 * }
 * const { item } = useContentItemPopulated<MyCMSTypes, "resource">("resource", "some-id")
 * // item?._relations?.categoryIds contains populated category items
 * ```
 */
export function useContentItemPopulated<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	id: string,
): {
	item: ContentItemWithRelations<TMap[TSlug]> | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["cmsContent", typeSlug, id, "populated"],
		queryFn: async () => {
			const response: unknown = await client(
				"/content/:typeSlug/:id/populated",
				{
					method: "GET",
					params: { typeSlug, id },
					headers,
				},
			);
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as ContentItemWithRelations<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
		enabled: !!typeSlug && !!id,
	});

	return {
		item: data ?? null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useContentItemPopulated
 */
export function useSuspenseContentItemPopulated<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	id: string,
): {
	item: ContentItemWithRelations<TMap[TSlug]> | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		queryKey: ["cmsContent", typeSlug, id, "populated"],
		queryFn: async () => {
			const response: unknown = await client(
				"/content/:typeSlug/:id/populated",
				{
					method: "GET",
					params: { typeSlug, id },
					headers,
				},
			);
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as ContentItemWithRelations<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		item: data ?? null,
		refetch,
	};
}

/**
 * Options for useContentByRelation hook
 */
export interface UseContentByRelationOptions {
	/** Number of items per page (default: 20) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

/**
 * Hook for fetching content items that have a specific relation.
 * Useful for "filter by category" functionality.
 *
 * @template TMap - A type map of content type slugs to their data types
 * @template TSlug - The content type slug (inferred from typeSlug parameter)
 *
 * @example
 * ```typescript
 * // Get all resources in a specific category
 * const { items } = useContentByRelation("resource", "categoryIds", categoryId)
 * ```
 */
export function useContentByRelation<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	fieldName: string,
	targetId: string,
	options: UseContentByRelationOptions = {},
): {
	items: SerializedContentItemWithType<TMap[TSlug]>[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const { limit = 20, enabled = true } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = useInfiniteQuery({
		queryKey: ["cmsContent", typeSlug, "by-relation", fieldName, targetId],
		queryFn: async ({ pageParam = 0 }) => {
			const response: unknown = await client("/content/:typeSlug/by-relation", {
				method: "GET",
				params: { typeSlug },
				query: { field: fieldName, targetId, limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedContentItems<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedContentItems)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedContentItems)?.items)
						? (page as PaginatedContentItems).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedContentItems)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
		enabled: enabled && !!typeSlug && !!fieldName && !!targetId,
	});

	const pages = (
		data as InfiniteData<PaginatedContentItems<TMap[TSlug]>, number> | undefined
	)?.pages;
	const items = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<TMap[TSlug]>[];
	const total = pages?.[0]?.total ?? 0;

	return {
		items,
		total,
		isLoading,
		error,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Suspense variant of useContentByRelation
 */
export function useSuspenseContentByRelation<
	TMap extends Record<string, Record<string, unknown>> = Record<
		string,
		Record<string, unknown>
	>,
	TSlug extends keyof TMap = keyof TMap,
>(
	typeSlug: TSlug & string,
	fieldName: string,
	targetId: string,
	options: UseContentByRelationOptions = {},
): {
	items: SerializedContentItemWithType<TMap[TSlug]>[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const { limit = 20 } = options;

	const {
		data,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
		error,
		isFetching,
	} = useSuspenseInfiniteQuery({
		queryKey: ["cmsContent", typeSlug, "by-relation", fieldName, targetId],
		queryFn: async ({ pageParam = 0 }) => {
			const response: unknown = await client("/content/:typeSlug/by-relation", {
				method: "GET",
				params: { typeSlug },
				query: { field: fieldName, targetId, limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedContentItems<
				TMap[TSlug]
			>;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedContentItems)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedContentItems)?.items)
						? (page as PaginatedContentItems).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedContentItems)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
	});

	if (error && !isFetching) {
		throw error;
	}

	const pages = data.pages as PaginatedContentItems<TMap[TSlug]>[];
	const items = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<TMap[TSlug]>[];
	const total = pages?.[0]?.total ?? 0;

	return {
		items,
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}
