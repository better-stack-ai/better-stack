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
import type { FormBuilderApiRouter } from "../../api";
import type {
	SerializedForm,
	PaginatedForms,
	SerializedFormSubmission,
	SerializedFormSubmissionWithData,
	PaginatedFormSubmissions,
} from "../../types";
import type { FormBuilderPluginOverrides } from "../overrides";
import { createFormBuilderQueryKeys } from "../../query-keys";

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
 * Shared React Query configuration for all Form Builder queries
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

// ========== Forms Hooks (Admin) ==========

export interface UseFormsOptions {
	/** Filter by status */
	status?: "active" | "inactive" | "archived";
	/** Number of items per page (default: 20) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

export interface UseFormsResult {
	forms: SerializedForm[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
}

/**
 * Hook for fetching paginated forms (admin)
 */
export function useForms(options: UseFormsOptions = {}): UseFormsResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const { status, limit = 20, enabled = true } = options;

	const baseQuery = queries.forms.list({ status, limit, offset: 0 });

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
			const response: unknown = await client("/forms", {
				method: "GET",
				query: { status, limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedForms;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedForms)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedForms)?.items)
						? (page as PaginatedForms).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedForms)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
		enabled,
	});

	const pages = (data as InfiniteData<PaginatedForms, number> | undefined)
		?.pages;
	const forms = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedForm[];
	const total = pages?.[0]?.total ?? 0;

	return {
		forms,
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
 * Suspense variant of useForms
 */
export function useSuspenseForms(options: UseFormsOptions = {}): {
	forms: SerializedForm[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const { status, limit = 20 } = options;

	const baseQuery = queries.forms.list({ status, limit, offset: 0 });

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
			const response: unknown = await client("/forms", {
				method: "GET",
				query: { status, limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedForms;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedForms)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedForms)?.items)
						? (page as PaginatedForms).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedForms)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
	});

	if (error && !isFetching) {
		throw error;
	}

	const pages = data.pages as PaginatedForms[];
	const forms = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedForm[];
	const total = pages?.[0]?.total ?? 0;

	return {
		forms,
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Hook for fetching a form by ID (admin)
 */
export function useFormById(id: string): {
	form: SerializedForm | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const baseQuery = queries.forms.byId(id);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!id,
	});

	return {
		form: data ?? null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useFormById
 */
export function useSuspenseFormById(id: string): {
	form: SerializedForm | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const baseQuery = queries.forms.byId(id);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		form: data ?? null,
		refetch,
	};
}

/**
 * Hook for fetching a form by slug (public)
 */
export function useFormBySlug(slug: string): {
	form: SerializedForm | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const baseQuery = queries.forms.bySlug(slug);

	const { data, isLoading, error, refetch } = useQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
		enabled: !!slug,
	});

	return {
		form: data ?? null,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Suspense variant of useFormBySlug
 */
export function useSuspenseFormBySlug(slug: string): {
	form: SerializedForm | null;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const baseQuery = queries.forms.bySlug(slug);

	const { data, refetch, error, isFetching } = useSuspenseQuery({
		...baseQuery,
		...SHARED_QUERY_CONFIG,
	});

	if (error && !isFetching) {
		throw error;
	}

	return {
		form: data ?? null,
		refetch,
	};
}

// ========== Form Mutations ==========

export interface CreateFormInput {
	name: string;
	slug: string;
	description?: string;
	schema: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
}

export interface UpdateFormInput {
	name?: string;
	slug?: string;
	description?: string;
	schema?: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
}

/**
 * Hook for creating a form
 */
export function useCreateForm() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createFormBuilderQueryKeys(client, headers);

	return useMutation<SerializedForm, Error, CreateFormInput>({
		mutationKey: [...queries.forms._def, "create"],
		mutationFn: async (data) => {
			const response: unknown = await client("@post/forms", {
				method: "POST",
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as SerializedForm;
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.forms._def,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for updating a form
 */
export function useUpdateForm() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createFormBuilderQueryKeys(client, headers);

	return useMutation<
		SerializedForm,
		Error,
		{ id: string; data: UpdateFormInput }
	>({
		mutationKey: [...queries.forms._def, "update"],
		mutationFn: async ({ id, data }) => {
			const response: unknown = await client("@put/forms/:id", {
				method: "PUT",
				params: { id },
				body: data,
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as SerializedForm;
		},
		onSuccess: async (updated) => {
			if (updated) {
				queryClient.setQueryData(
					queries.forms.byId(updated.id).queryKey,
					updated,
				);
				queryClient.setQueryData(
					queries.forms.bySlug(updated.slug).queryKey,
					updated,
				);
			}
			await queryClient.invalidateQueries({
				queryKey: queries.forms._def,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

/**
 * Hook for deleting a form
 */
export function useDeleteForm() {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createFormBuilderQueryKeys(client, headers);

	return useMutation<{ success: boolean }, Error, string>({
		mutationKey: [...queries.forms._def, "delete"],
		mutationFn: async (id) => {
			const response: unknown = await client("@delete/forms/:id", {
				method: "DELETE",
				params: { id },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as { success: boolean };
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.forms._def,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}

// ========== Form Submission Hooks ==========

/**
 * Hook for submitting a form (public)
 */
export function useSubmitForm(slug: string) {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);

	return useMutation<
		SerializedFormSubmission & {
			form: { successMessage?: string; redirectUrl?: string };
		},
		Error,
		{ data: Record<string, unknown> }
	>({
		mutationKey: [...queries.forms._def, slug, "submit"],
		mutationFn: async ({ data }) => {
			const response: unknown = await client("@post/forms/:slug/submit", {
				method: "POST",
				params: { slug },
				body: { data },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown })
				.data as SerializedFormSubmission & {
				form: { successMessage?: string; redirectUrl?: string };
			};
		},
	});
}

// ========== Submissions Management Hooks (Admin) ==========

export interface UseSubmissionsOptions {
	/** Number of items per page (default: 20) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

export interface UseSubmissionsResult {
	submissions: SerializedFormSubmissionWithData[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
}

/**
 * Hook for fetching paginated submissions for a form (admin)
 */
export function useSubmissions(
	formId: string,
	options: UseSubmissionsOptions = {},
): UseSubmissionsResult {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const { limit = 20, enabled = true } = options;

	const baseQuery = queries.formSubmissions.list({
		formId,
		limit,
		offset: 0,
	});

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
			const response: unknown = await client("/forms/:formId/submissions", {
				method: "GET",
				params: { formId },
				query: { limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedFormSubmissions;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedFormSubmissions)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedFormSubmissions)?.items)
						? (page as PaginatedFormSubmissions).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedFormSubmissions)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
		enabled: enabled && !!formId,
	});

	const pages = (
		data as InfiniteData<PaginatedFormSubmissions, number> | undefined
	)?.pages;
	const submissions = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedFormSubmissionWithData[];
	const total = pages?.[0]?.total ?? 0;

	return {
		submissions,
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
 * Suspense variant of useSubmissions
 */
export function useSuspenseSubmissions(
	formId: string,
	options: UseSubmissionsOptions = {},
): {
	submissions: SerializedFormSubmissionWithData[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queries = createFormBuilderQueryKeys(client, headers);
	const { limit = 20 } = options;

	const baseQuery = queries.formSubmissions.list({
		formId,
		limit,
		offset: 0,
	});

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
			const response: unknown = await client("/forms/:formId/submissions", {
				method: "GET",
				params: { formId },
				query: { limit, offset: pageParam },
				headers,
			});
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as PaginatedFormSubmissions;
		},
		...SHARED_QUERY_CONFIG,
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			if (!lastPage || typeof lastPage !== "object") return undefined;
			const items = (lastPage as PaginatedFormSubmissions)?.items;
			if (!Array.isArray(items) || items.length < limit) return undefined;
			const loadedCount = (allPages || []).reduce(
				(sum, page) =>
					sum +
					(Array.isArray((page as PaginatedFormSubmissions)?.items)
						? (page as PaginatedFormSubmissions).items.length
						: 0),
				0,
			);
			const total = (lastPage as PaginatedFormSubmissions)?.total ?? 0;
			if (loadedCount >= total) return undefined;
			return loadedCount;
		},
	});

	if (error && !isFetching) {
		throw error;
	}

	const pages = data.pages as PaginatedFormSubmissions[];
	const submissions = (pages?.flatMap((page) =>
		Array.isArray(page?.items) ? page.items : [],
	) ?? []) as SerializedFormSubmissionWithData[];
	const total = pages?.[0]?.total ?? 0;

	return {
		submissions,
		total,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

/**
 * Hook for deleting a submission
 */
export function useDeleteSubmission(formId: string) {
	const { refresh, apiBaseURL, apiBasePath, headers } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const client = createApiClient<FormBuilderApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	const queryClient = useQueryClient();
	const queries = createFormBuilderQueryKeys(client, headers);

	return useMutation<{ success: boolean }, Error, string>({
		mutationKey: [...queries.formSubmissions._def, formId, "delete"],
		mutationFn: async (subId) => {
			const response: unknown = await client(
				"@delete/forms/:formId/submissions/:subId",
				{
					method: "DELETE",
					params: { formId, subId },
					headers,
				},
			);
			if (isErrorResponse(response)) {
				throw toError(response.error);
			}
			return (response as { data?: unknown }).data as { success: boolean };
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: queries.formSubmissions._def,
			});
			if (refresh) {
				await refresh();
			}
		},
	});
}
