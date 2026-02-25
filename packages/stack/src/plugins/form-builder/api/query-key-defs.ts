/**
 * Internal query key constants for the Form Builder plugin.
 * Shared between query-keys.ts (HTTP path) and prefetchForRoute (DB path)
 * to prevent key drift between SSR loaders and SSG prefetching.
 */

export interface FormsListDiscriminator {
	status?: "active" | "inactive" | "archived";
	limit: number;
	offset: number;
}

export interface SubmissionsListDiscriminator {
	formId: string;
	limit: number;
	offset: number;
}

/**
 * Builds the discriminator object for the forms list query key.
 * Mirrors the params object used in createFormsQueries.list.
 */
export function formsListDiscriminator(params?: {
	status?: "active" | "inactive" | "archived";
	limit?: number;
	offset?: number;
}): FormsListDiscriminator {
	return {
		status: params?.status,
		limit: params?.limit ?? 20,
		offset: params?.offset ?? 0,
	};
}

/**
 * Builds the discriminator object for the submissions list query key.
 * Mirrors the params object used in createSubmissionsQueries.list.
 */
export function submissionsListDiscriminator(params: {
	formId: string;
	limit?: number;
	offset?: number;
}): SubmissionsListDiscriminator {
	return {
		formId: params.formId,
		limit: params.limit ?? 20,
		offset: params.offset ?? 0,
	};
}

/** Full query key builders — use these with queryClient.setQueryData() */
export const FORM_QUERY_KEYS = {
	/**
	 * Key for forms.list(params) query.
	 * Full key: ["forms", "list", "list", { status, limit, offset }]
	 */
	formsList: (params?: {
		status?: "active" | "inactive" | "archived";
		limit?: number;
		offset?: number;
	}) => ["forms", "list", "list", formsListDiscriminator(params)] as const,

	/**
	 * Key for forms.byId(id) query.
	 * Full key: ["forms", "byId", "byId", id]
	 */
	formById: (id: string) => ["forms", "byId", "byId", id] as const,

	/**
	 * Key for formSubmissions.list(params) query.
	 * Full key: ["formSubmissions", "list", { formId, limit, offset }]
	 */
	submissionsList: (params: {
		formId: string;
		limit?: number;
		offset?: number;
	}) =>
		["formSubmissions", "list", submissionsListDiscriminator(params)] as const,
};
