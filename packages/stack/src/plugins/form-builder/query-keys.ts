import type { FormBuilderApiRouter } from "./api";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	SerializedForm,
	PaginatedForms,
	PaginatedFormSubmissions,
	SerializedFormSubmission,
	SerializedFormSubmissionWithData,
} from "./types";
import {
	formsListDiscriminator,
	submissionsListDiscriminator,
} from "./api/query-key-defs";

/** Params for the paginated forms list (one page per `limit`). */
export interface FormListParams {
	status?: "active" | "inactive" | "archived";
	limit?: number;
	/**
	 * Included in the query key discriminator for compatibility with
	 * callers that pass it explicitly; the infinite query itself injects
	 * the page offset per page (always starting at 0).
	 */
	offset?: number;
	/** Free-text search across form names and slugs */
	search?: string;
}

/** Params for the paginated submissions list of one form. */
export interface SubmissionListParams {
	formId: string;
	limit?: number;
	/** See {@link FormListParams.offset} */
	offset?: number;
}

/** Input for the create-form mutation. */
export interface CreateFormInput {
	name: string;
	slug: string;
	description?: string;
	schema: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
}

/** Input for the update-form mutation. */
export interface UpdateFormInput {
	name?: string;
	slug?: string;
	description?: string;
	schema?: string;
	successMessage?: string;
	redirectUrl?: string;
	status?: "active" | "inactive" | "archived";
}

/** Normalizes an empty/whitespace search term to `undefined`. */
function normalizeSearch(search: string | undefined): string | undefined {
	return search !== undefined && search.trim() === "" ? undefined : search;
}

/**
 * `getNextPageParam` for `{ items, total }` page envelopes: stop when the
 * last page is short or everything is loaded, otherwise continue at the
 * loaded-item offset.
 */
function paginatedNextPageParam(
	lastPage: { items?: unknown[]; total?: number },
	allPages: { items?: unknown[]; total?: number }[],
	limit: number,
): number | undefined {
	const items = Array.isArray(lastPage?.items) ? lastPage.items : [];
	if (items.length < limit) return undefined;
	const loadedCount = allPages.reduce(
		(sum, page) => sum + (Array.isArray(page?.items) ? page.items.length : 0),
		0,
	);
	const total = lastPage?.total ?? 0;
	if (loadedCount >= total) return undefined;
	return loadedCount;
}

/**
 * Form Builder resource declaration — the single source of truth for query
 * keys, HTTP mappings and mutations. Feeds both `createFormBuilderQueryKeys`
 * (SSR loaders) and `createResource` (client hooks, see `client/hooks`).
 *
 * Key shapes intentionally match `FORM_QUERY_KEYS` in
 * `api/query-key-defs.ts` so SSG `prefetchForRoute` hydration keeps working.
 * List pages stay as `{ items, total, limit, offset }` envelopes (via
 * `nextPageParam`) so `total` survives SSG dehydration.
 */
export const formBuilderResources = {
	forms: {
		queries: {
			list: {
				path: "/forms",
				query: (p: FormListParams) => ({
					status: p.status,
					limit: p.limit ?? 20,
					search: normalizeSearch(p.search),
				}),
				key: (p: FormListParams) => ["list", formsListDiscriminator(p)],
				select: (data: any, _p: FormListParams): PaginatedForms => data,
				infinite: true,
				pageSize: (p: FormListParams) => p.limit ?? 20,
				nextPageParam: (
					lastPage: PaginatedForms,
					allPages: PaginatedForms[],
					p: FormListParams,
				) => paginatedNextPageParam(lastPage, allPages, p.limit ?? 20),
			},

			bySlug: {
				path: "/forms/:slug",
				params: (slug: string) => ({ slug }),
				key: (slug: string) => ["bySlug", slug],
				select: (data: any, _slug: string): SerializedForm | null =>
					data ?? null,
				skip: (slug: string) => !slug,
			},

			byId: {
				path: "/forms/id/:id",
				params: (id: string) => ({ id }),
				key: (id: string) => ["byId", id],
				select: (data: any, _id: string): SerializedForm | null => data ?? null,
				skip: (id: string) => !id,
			},

			forUpdate: {
				path: "/forms/id/:id/edit",
				params: (id: string) => ({ id }),
				key: (id: string) => ["forUpdate", id],
				select: (data: any, _id: string): SerializedForm | null => data ?? null,
				skip: (id: string) => !id,
			},
		},

		mutations: {
			create: {
				path: "@post/forms",
				method: "POST" as const,
				input: (vars: CreateFormInput) => ({ body: vars }),
				select: (data: any) => data as SerializedForm,
				invalidates: ["forms"],
			},
			update: {
				path: "@put/forms/:id",
				method: "PUT" as const,
				input: (vars: { id: string; data: UpdateFormInput }) => ({
					params: { id: vars.id },
					body: vars.data,
				}),
				select: (data: any) => data as SerializedForm,
				invalidates: ["forms"],
				setData: {
					query: "byId",
					args: (updated: SerializedForm) => (updated ? [updated.id] : null),
				},
			},
			delete: {
				path: "@delete/forms/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["forms"],
			},
			// Public form submission — no cache invalidation, and no router
			// refresh: the success screen is client state in FormRenderer and a
			// refresh (full reload on public pages) would wipe it.
			submit: {
				path: "@post/forms/:slug/submit",
				method: "POST" as const,
				input: (vars: { slug: string; data: Record<string, unknown> }) => ({
					params: { slug: vars.slug },
					body: { data: vars.data },
				}),
				select: (data: any) =>
					data as SerializedFormSubmission & {
						form: { successMessage?: string; redirectUrl?: string };
					},
				refresh: false,
			},
		},
	},

	formSubmissions: {
		queries: {
			list: {
				path: "/forms/:formId/submissions",
				params: (p: SubmissionListParams) => ({ formId: p.formId }),
				query: (p: SubmissionListParams) => ({ limit: p.limit ?? 20 }),
				key: (p: SubmissionListParams) => [submissionsListDiscriminator(p)],
				select: (
					data: any,
					_p: SubmissionListParams,
				): PaginatedFormSubmissions => data,
				infinite: true,
				pageSize: (p: SubmissionListParams) => p.limit ?? 20,
				nextPageParam: (
					lastPage: PaginatedFormSubmissions,
					allPages: PaginatedFormSubmissions[],
					p: SubmissionListParams,
				) => paginatedNextPageParam(lastPage, allPages, p.limit ?? 20),
			},

			detail: {
				path: "/forms/:formId/submissions/:subId",
				params: (formId: string, subId: string) => ({ formId, subId }),
				key: (formId: string, subId: string) => [formId, subId],
				select: (
					data: any,
					_formId: string,
					_subId: string,
				): SerializedFormSubmissionWithData | null => data ?? null,
				skip: (formId: string, subId: string) => !formId || !subId,
			},
		},

		mutations: {
			delete: {
				path: "@delete/forms/:formId/submissions/:subId",
				method: "DELETE" as const,
				input: (vars: { formId: string; subId: string }) => ({
					params: { formId: vars.formId, subId: vars.subId },
				}),
				select: (data: any) => data as { success: boolean },
				invalidates: ["formSubmissions"],
			},
		},
	},
} satisfies ResourcesDeclaration;

/**
 * Create Form Builder query keys for React Query
 * Used by consumers and SSR loaders to fetch forms and submissions
 */
export function createFormBuilderQueryKeys(
	client: ReturnType<typeof createApiClient<FormBuilderApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, formBuilderResources, headers);
}
