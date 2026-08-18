"use client";

import type {
	ResourceFormConfig,
	ResourceFormResult,
} from "@btst/stack/plugins/client/hooks";
import type {
	SerializedContentType,
	SerializedContentItemWithType,
	PaginatedContentItems,
	InverseRelation,
} from "../../types";
import { cms } from "./cms-resource";

/** Flattens infinite-query pages of `{ items, total }` envelopes. */
function flattenPages<TData>(pages: PaginatedContentItems[] | undefined): {
	items: SerializedContentItemWithType<TData>[];
	total: number;
} {
	const items = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<TData>[];
	const total = pages?.[0]?.total ?? 0;
	return { items, total };
}

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
	const { data, isLoading, error, refetch } = cms.cmsTypes.list.use([]);

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
	const { data, refetch } = cms.cmsTypes.list.useSuspense([]);

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
	const { data, isLoading, error, refetch } = cms.cmsTypes.detail.use([slug], {
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
	/** Free-text search across item slugs and data values */
	search?: string;
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
	const { limit = 10, enabled = true, search } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = cms.cmsContent.list.useInfinite([{ typeSlug, limit, search }], {
		enabled: enabled && !!typeSlug,
	});

	const { items, total } = flattenPages<TMap[TSlug]>(data?.pages);

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
	const { limit = 10, search } = options;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		cms.cmsContent.list.useSuspenseInfinite([{ typeSlug, limit, search }]);

	const { items, total } = flattenPages<TMap[TSlug]>(data.pages);

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
	const { data, isLoading, error, refetch } = cms.cmsContent.detail.use(
		[typeSlug, id],
		{ enabled: !!typeSlug && !!id },
	);

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]> | null) ?? null,
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
	const { data, refetch } = cms.cmsContent.detail.useSuspense([typeSlug, id]);

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]> | null) ?? null,
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
	const { data, isLoading, error, refetch } = cms.cmsContent.bySlug.use(
		[typeSlug, slug],
		{ enabled: !!typeSlug && !!slug },
	);

	return {
		item: (data as SerializedContentItemWithType<TMap[TSlug]> | null) ?? null,
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
	const mutation = cms.cmsContent.create.use();

	return {
		...mutation,
		mutate: (vars: { slug: string; data: TData }) =>
			mutation.mutate({
				typeSlug,
				slug: vars.slug,
				data: vars.data as Record<string, unknown>,
			}),
		mutateAsync: async (vars: { slug: string; data: TData }) =>
			(await mutation.mutateAsync({
				typeSlug,
				slug: vars.slug,
				data: vars.data as Record<string, unknown>,
			})) as SerializedContentItemWithType<TData>,
	};
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
	const mutation = cms.cmsContent.update.use();

	const toVars = (vars: {
		id: string;
		data: { slug?: string; data?: TData };
	}) => ({
		typeSlug,
		id: vars.id,
		data: vars.data as { slug?: string; data?: Record<string, unknown> },
	});

	return {
		...mutation,
		mutate: (vars: { id: string; data: { slug?: string; data?: TData } }) =>
			mutation.mutate(toVars(vars)),
		mutateAsync: async (vars: {
			id: string;
			data: { slug?: string; data?: TData };
		}) =>
			(await mutation.mutateAsync(
				toVars(vars),
			)) as SerializedContentItemWithType<TData>,
	};
}

/**
 * Hook for deleting a content item
 */
export function useDeleteContent(typeSlug: string) {
	const mutation = cms.cmsContent.delete.use();

	return {
		...mutation,
		mutate: (id: string) => mutation.mutate({ typeSlug, id }),
		mutateAsync: (id: string) => mutation.mutateAsync({ typeSlug, id }),
	};
}

/**
 * Form lifecycle hook for creating/editing content items, built on the core
 * resource `useForm`: submits the right mutation, awaits invalidation,
 * notifies via `useNotify()`, redirects, and maps server validation issues
 * to `fieldErrors`.
 */
export function useContentItemForm<TValues>(
	config: ResourceFormConfig<
		TValues,
		SerializedContentItemWithType | null,
		SerializedContentItemWithType | null
	>,
): ResourceFormResult<
	TValues,
	SerializedContentItemWithType | null,
	SerializedContentItemWithType | null
> {
	return cms.cmsContent.useForm<TValues, SerializedContentItemWithType | null>(
		config,
	);
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
	const { data, isLoading, error, refetch } = cms.cmsContent.populated.use(
		[typeSlug, id],
		{ enabled: !!typeSlug && !!id },
	);

	return {
		item: (data as ContentItemWithRelations<TMap[TSlug]> | null) ?? null,
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
	const { data, refetch } = cms.cmsContent.populated.useSuspense([
		typeSlug,
		id,
	]);

	return {
		item: (data as ContentItemWithRelations<TMap[TSlug]> | null) ?? null,
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
	const { limit = 20, enabled = true } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = cms.cmsContent.byRelation.useInfinite(
		[{ typeSlug, field: fieldName, targetId, limit }],
		{ enabled: enabled && !!typeSlug && !!fieldName && !!targetId },
	);

	const { items, total } = flattenPages<TMap[TSlug]>(data?.pages);

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
	const { limit = 20 } = options;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		cms.cmsContent.byRelation.useSuspenseInfinite([
			{ typeSlug, field: fieldName, targetId, limit },
		]);

	const { items, total } = flattenPages<TMap[TSlug]>(data.pages);

	return {
		items,
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

// ========== Inverse Relation Hooks ==========

/**
 * Hook for fetching the inverse relations of a content item — the content
 * types with belongsTo fields pointing at it, with per-field counts.
 */
export function useInverseRelations(
	contentTypeSlug: string,
	itemId: string,
): {
	inverseRelations: InverseRelation[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { data, isLoading, error, refetch } = cms.cmsTypes.inverseRelations.use(
		[{ slug: contentTypeSlug, itemId }],
		{ enabled: !!contentTypeSlug && !!itemId },
	);

	return {
		inverseRelations: data ?? [],
		isLoading,
		error,
		refetch,
	};
}

/**
 * Hook for listing the items behind one inverse relation (e.g. all comments
 * whose `resourceId` points at this resource).
 */
export function useInverseRelationItems(
	params: {
		contentTypeSlug: string;
		sourceType: string;
		itemId: string;
		fieldName: string;
	},
	options: { enabled?: boolean } = {},
): {
	items: SerializedContentItemWithType[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { data, isLoading, error, refetch } =
		cms.cmsTypes.inverseRelationItems.use(
			[
				{
					slug: params.contentTypeSlug,
					sourceType: params.sourceType,
					itemId: params.itemId,
					fieldName: params.fieldName,
				},
			],
			{ enabled: options.enabled ?? true },
		);

	return {
		items: data?.items ?? [],
		total: data?.total ?? 0,
		isLoading,
		error,
		refetch,
	};
}
