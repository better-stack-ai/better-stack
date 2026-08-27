"use client";

import type {
	ResourceFormConfig,
	ResourceFormResult,
} from "@btst/stack/plugins/client/hooks";
import type {
	SerializedForm,
	PaginatedForms,
	SerializedFormSubmissionWithData,
	PaginatedFormSubmissions,
	SubmissionListFormContext,
} from "../../types";
import { formBuilder } from "./form-builder-resource";

export type { CreateFormInput, UpdateFormInput } from "../../query-keys";

/** Flattens infinite-query pages of `{ items, total }` envelopes. */
function flattenPages<TItem>(
	pages: { items?: TItem[]; total?: number }[] | undefined,
): { items: TItem[]; total: number } {
	const items =
		pages?.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])) ??
		[];
	const total = pages?.[0]?.total ?? 0;
	return { items, total };
}

// ========== Forms Hooks (Admin) ==========

export interface UseFormsOptions {
	/** Filter by status */
	status?: "active" | "inactive" | "archived";
	/** Number of items per page (default: 20) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
	/** Free-text search across form names and slugs */
	search?: string;
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
	const { status, limit = 20, enabled = true, search } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = formBuilder.forms.list.useInfinite([{ status, limit, search }], {
		enabled,
	});

	const { items, total } = flattenPages<SerializedForm>(
		data?.pages as PaginatedForms[] | undefined,
	);

	return {
		forms: items,
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
	const { status, limit = 20, search } = options;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		formBuilder.forms.list.useSuspenseInfinite([{ status, limit, search }]);

	const { items, total } = flattenPages<SerializedForm>(
		data.pages as PaginatedForms[],
	);

	return {
		forms: items,
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
	const { data, isLoading, error, refetch } = formBuilder.forms.byId.use([id], {
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
	const { data, refetch } = formBuilder.forms.byId.useSuspense([id]);

	return {
		form: data ?? null,
		refetch,
	};
}

/**
 * Fetches editor data through the same update permission as the edit route.
 */
export function useSuspenseFormForUpdate(id: string): {
	form: SerializedForm | null;
	refetch: () => Promise<unknown>;
} {
	const { data, refetch } = formBuilder.forms.forUpdate.useSuspense([id]);

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
	const { data, isLoading, error, refetch } = formBuilder.forms.bySlug.use(
		[slug],
		{ enabled: !!slug },
	);

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
	const { data, refetch } = formBuilder.forms.bySlug.useSuspense([slug]);

	return {
		form: data ?? null,
		refetch,
	};
}

// ========== Form Mutations ==========

/**
 * Hook for creating a form
 */
export function useCreateForm() {
	return formBuilder.forms.create.use();
}

/**
 * Hook for updating a form
 */
export function useUpdateForm() {
	return formBuilder.forms.update.use();
}

/**
 * Hook for deleting a form
 */
export function useDeleteForm() {
	return formBuilder.forms.delete.use();
}

/**
 * Form lifecycle hook for creating/editing forms, built on the core resource
 * `useForm`: submits the right mutation, awaits invalidation, notifies via
 * `useNotify()`, redirects, and maps server validation issues to
 * `fieldErrors`.
 */
export function useFormBuilderForm<TValues>(
	config: ResourceFormConfig<TValues, SerializedForm | null, SerializedForm>,
): ResourceFormResult<TValues, SerializedForm | null, SerializedForm> {
	return formBuilder.forms.useForm<
		TValues,
		SerializedForm,
		SerializedForm | null
	>(config);
}

// ========== Form Submission Hooks ==========

/**
 * Hook for submitting a form (public)
 */
export function useSubmitForm(slug: string) {
	const mutation = formBuilder.forms.submit.use();

	return {
		...mutation,
		mutate: (vars: { data: Record<string, unknown> }) =>
			mutation.mutate({ slug, data: vars.data }),
		mutateAsync: (vars: { data: Record<string, unknown> }) =>
			mutation.mutateAsync({ slug, data: vars.data }),
	};
}

// ========== Submissions Management Hooks (Admin) ==========

export interface UseSubmissionsOptions {
	/** Number of items per page (default: 20) */
	limit?: number;
	/** Whether to enable the query (default: true) */
	enabled?: boolean;
}

export interface UseSubmissionsResult {
	form: SubmissionListFormContext | null;
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
	const { limit = 20, enabled = true } = options;

	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = formBuilder.formSubmissions.list.useInfinite([{ formId, limit }], {
		enabled: enabled && !!formId,
	});

	const { items, total } = flattenPages<SerializedFormSubmissionWithData>(
		data?.pages as PaginatedFormSubmissions[] | undefined,
	);
	const form =
		(data?.pages as PaginatedFormSubmissions[] | undefined)?.[0]?.form ?? null;

	return {
		form,
		submissions: items,
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
	form: SubmissionListFormContext | null;
	submissions: SerializedFormSubmissionWithData[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { limit = 20 } = options;

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		formBuilder.formSubmissions.list.useSuspenseInfinite([{ formId, limit }]);

	const { items, total } = flattenPages<SerializedFormSubmissionWithData>(
		data.pages as PaginatedFormSubmissions[],
	);
	const form = (data.pages as PaginatedFormSubmissions[])[0]?.form ?? null;

	return {
		form,
		submissions: items,
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
	const mutation = formBuilder.formSubmissions.delete.use();

	return {
		...mutation,
		mutate: (subId: string) => mutation.mutate({ formId, subId }),
		mutateAsync: (subId: string) => mutation.mutateAsync({ formId, subId }),
	};
}
