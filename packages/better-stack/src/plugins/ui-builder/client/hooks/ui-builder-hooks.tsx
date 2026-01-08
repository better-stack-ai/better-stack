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
import type { CMSApiRouter } from "../../../cms/api";
import type {
	PaginatedContentItems,
	SerializedContentItemWithType,
} from "../../../cms/types";
import { createCMSQueryKeys } from "../../../cms/query-keys";
import {
	UI_BUILDER_TYPE_SLUG,
	type UIBuilderPageSchemaType,
} from "../../schemas";
import type { UIBuilderPluginOverrides } from "../overrides";
import type { SerializedUIBuilderPage, UIBuilderPageData } from "../../types";
import type {
	ComponentLayer,
	Variable,
} from "@workspace/ui/components/ui-builder/types";

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
 * Shared React Query configuration
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
 * Convert a CMS content item to a serialized UI Builder page
 */
function toUIBuilderPage(
	item: SerializedContentItemWithType<UIBuilderPageSchemaType>,
): SerializedUIBuilderPage {
	return {
		id: item.id,
		contentTypeId: item.contentTypeId,
		slug: item.slug,
		data: item.data,
		authorId: item.authorId,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
		parsedData: item.parsedData as UIBuilderPageData,
	};
}

/**
 * Parse UI Builder page data from JSON strings
 */
function parseLayers(layersJson: string): ComponentLayer[] {
	try {
		return JSON.parse(layersJson) as ComponentLayer[];
	} catch {
		return [];
	}
}

function parseVariables(variablesJson: string): Variable[] {
	try {
		return JSON.parse(variablesJson) as Variable[];
	} catch {
		return [];
	}
}

// ========== List Hooks ==========

export interface UseUIBuilderPagesOptions {
	/** Number of items per page (default: 10) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

export interface UseUIBuilderPagesResult {
	pages: SerializedUIBuilderPage[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
}

/**
 * Hook for fetching paginated UI Builder pages with load more functionality.
 *
 * @example
 * ```typescript
 * const { pages, loadMore, hasMore, isLoading } = useUIBuilderPages()
 * ```
 */
export function useUIBuilderPages(
	options: UseUIBuilderPagesOptions = {},
): UseUIBuilderPagesResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const { limit = 10, enabled = true } = options;
	const typeSlug = UI_BUILDER_TYPE_SLUG;

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
		queryKey: [...baseQuery.queryKey, "ui-builder"],
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
			return (response as { data?: unknown })
				.data as PaginatedContentItems<UIBuilderPageSchemaType>;
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
		enabled: enabled,
	});

	type PageData = PaginatedContentItems<UIBuilderPageSchemaType>;
	const pagesData = (data as InfiniteData<PageData, number> | undefined)?.pages;
	const items = (pagesData?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<UIBuilderPageSchemaType>[];
	const total = pagesData?.[0]?.total ?? 0;

	return {
		pages: items.map(toUIBuilderPage),
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
 * Suspense variant of useUIBuilderPages
 */
export function useSuspenseUIBuilderPages(
	options: UseUIBuilderPagesOptions = {},
): {
	pages: SerializedUIBuilderPage[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const { limit = 10 } = options;
	const typeSlug = UI_BUILDER_TYPE_SLUG;

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
		queryKey: [...baseQuery.queryKey, "ui-builder"],
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
			return (response as { data?: unknown })
				.data as PaginatedContentItems<UIBuilderPageSchemaType>;
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

	type PageData = PaginatedContentItems<UIBuilderPageSchemaType>;
	const pagesData = data.pages as PageData[];
	const items = (pagesData?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedContentItemWithType<UIBuilderPageSchemaType>[];
	const total = pagesData?.[0]?.total ?? 0;

	return {
		pages: items.map(toUIBuilderPage),
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

// ========== Single Page Hooks ==========

/**
 * Hook for fetching a single UI Builder page by ID
 *
 * @example
 * ```typescript
 * const { page, isLoading, error } = useUIBuilderPage(pageId)
 * ```
 */
export function useUIBuilderPage(id: string): {
	page: SerializedUIBuilderPage | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;
	const baseQuery = queries.cmsContent.detail(typeSlug, id);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!id,
	});

	return {
		page: data
			? toUIBuilderPage(
					data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
				)
			: null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useUIBuilderPage
 */
export function useSuspenseUIBuilderPage(id: string): {
	page: SerializedUIBuilderPage | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;
	const baseQuery = queries.cmsContent.detail(typeSlug, id);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		page: data
			? toUIBuilderPage(
					data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
				)
			: null,
		refetch,
	};
}

/**
 * Hook for fetching a UI Builder page by slug
 *
 * @example
 * ```typescript
 * const { page, isLoading, error } = useUIBuilderPageBySlug("my-page")
 * ```
 */
export function useUIBuilderPageBySlug(slug: string): {
	page: SerializedUIBuilderPage | null;
	layers: ComponentLayer[];
	variables: Variable[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;
	const baseQuery = queries.cmsContent.bySlug(typeSlug, slug);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!slug,
	});

	const page = data
		? toUIBuilderPage(
				data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
			)
		: null;

	return {
		page,
		layers: page ? parseLayers(page.parsedData.layers) : [],
		variables: page ? parseVariables(page.parsedData.variables) : [],
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useUIBuilderPageBySlug
 */
export function useSuspenseUIBuilderPageBySlug(slug: string): {
	page: SerializedUIBuilderPage | null;
	layers: ComponentLayer[];
	variables: Variable[];
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;
	const baseQuery = queries.cmsContent.bySlug(typeSlug, slug);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	const page = data
		? toUIBuilderPage(
				data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
			)
		: null;

	return {
		page,
		layers: page ? parseLayers(page.parsedData.layers) : [],
		variables: page ? parseVariables(page.parsedData.variables) : [],
		refetch,
	};
}

// ========== Mutation Hooks ==========

export interface CreateUIBuilderPageInput {
	slug: string;
	layers: ComponentLayer[];
	variables?: Variable[];
	status?: "published" | "draft" | "archived";
}

export interface UpdateUIBuilderPageInput {
	slug?: string;
	layers?: ComponentLayer[];
	variables?: Variable[];
	status?: "published" | "draft" | "archived";
}

/**
 * Hook for creating a UI Builder page
 *
 * @example
 * ```typescript
 * const createPage = useCreateUIBuilderPage()
 *
 * createPage.mutate({
 *   slug: "my-new-page",
 *   layers: [...],
 *   status: "draft"
 * })
 * ```
 */
export function useCreateUIBuilderPage() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;

	return useMutation<SerializedUIBuilderPage, Error, CreateUIBuilderPageInput>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "create", "ui-builder"],
		mutationFn: async (input) => {
			const data: UIBuilderPageSchemaType = {
				layers: JSON.stringify(input.layers),
				variables: JSON.stringify(input.variables ?? []),
				status: input.status ?? "draft",
			};

			const response: unknown = await client("@post/content/:typeSlug", {
				method: "POST",
				params: { typeSlug },
				body: { slug: input.slug, data },
				headers,
			});

			if (isErrorResponse(response)) {
				throw toError(response.error);
			}

			return toUIBuilderPage(
				(response as { data?: unknown })
					.data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
			);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.cmsContent.list._def,
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

/**
 * Hook for updating a UI Builder page
 *
 * @example
 * ```typescript
 * const updatePage = useUpdateUIBuilderPage()
 *
 * updatePage.mutate({
 *   id: pageId,
 *   data: {
 *     layers: updatedLayers,
 *     status: "published"
 *   }
 * })
 * ```
 */
export function useUpdateUIBuilderPage() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;

	return useMutation<
		SerializedUIBuilderPage,
		Error,
		{ id: string; data: UpdateUIBuilderPageInput }
	>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "update", "ui-builder"],
		mutationFn: async ({ id, data: input }) => {
			const data: Partial<UIBuilderPageSchemaType> = {};

			if (input.layers !== undefined) {
				data.layers = JSON.stringify(input.layers);
			}
			if (input.variables !== undefined) {
				data.variables = JSON.stringify(input.variables);
			}
			if (input.status !== undefined) {
				data.status = input.status;
			}

			const body: { slug?: string; data?: Partial<UIBuilderPageSchemaType> } =
				{};
			if (input.slug !== undefined) {
				body.slug = input.slug;
			}
			if (Object.keys(data).length > 0) {
				body.data = data;
			}

			const response: unknown = await client("@put/content/:typeSlug/:id", {
				method: "PUT",
				params: { typeSlug, id },
				body,
				headers,
			});

			if (isErrorResponse(response)) {
				throw toError(response.error);
			}

			return toUIBuilderPage(
				(response as { data?: unknown })
					.data as SerializedContentItemWithType<UIBuilderPageSchemaType>,
			);
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
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for deleting a UI Builder page
 *
 * @example
 * ```typescript
 * const deletePage = useDeleteUIBuilderPage()
 *
 * deletePage.mutate(pageId)
 * ```
 */
export function useDeleteUIBuilderPage() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createCMSQueryKeys(client, headers);
	const typeSlug = UI_BUILDER_TYPE_SLUG;

	return useMutation<{ success: boolean }, Error, string>({
		mutationKey: [...queries.cmsContent._def, typeSlug, "delete", "ui-builder"],
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
