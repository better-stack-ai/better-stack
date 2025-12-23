import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { FormBuilderApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type {
	SerializedForm,
	PaginatedForms,
	PaginatedFormSubmissions,
	SerializedFormSubmissionWithData,
} from "./types";

interface FormListParams {
	status?: "active" | "inactive" | "archived";
	limit?: number;
	offset?: number;
}

interface SubmissionListParams {
	formId: string;
	limit?: number;
	offset?: number;
}

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
 * Create Form Builder query keys for React Query
 * Used by consumers to fetch forms and submissions
 */
export function createFormBuilderQueryKeys(
	client: ReturnType<typeof createApiClient<FormBuilderApiRouter>>,
	headers?: HeadersInit,
) {
	const forms = createFormsQueries(client, headers);
	const submissions = createSubmissionsQueries(client, headers);

	return mergeQueryKeys(forms, submissions);
}

function createFormsQueries(
	client: ReturnType<typeof createApiClient<FormBuilderApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("forms", {
		list: (params: FormListParams = {}) => ({
			queryKey: ["list", params],
			queryFn: async () => {
				try {
					const response: unknown = await client("/forms", {
						method: "GET",
						query: {
							status: params.status,
							limit: params.limit ?? 20,
							offset: params.offset ?? 0,
						},
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown }).data as PaginatedForms;
				} catch (error) {
					throw error;
				}
			},
		}),

		bySlug: (slug: string) => ({
			queryKey: ["bySlug", slug],
			queryFn: async () => {
				if (!slug) return null;

				try {
					const response: unknown = await client("/forms/:slug", {
						method: "GET",
						params: { slug },
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown }).data as SerializedForm | null;
				} catch (error) {
					throw error;
				}
			},
		}),

		byId: (id: string) => ({
			queryKey: ["byId", id],
			queryFn: async () => {
				if (!id) return null;

				try {
					const response: unknown = await client("/forms/id/:id", {
						method: "GET",
						params: { id },
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown }).data as SerializedForm | null;
				} catch (error) {
					throw error;
				}
			},
		}),
	});
}

function createSubmissionsQueries(
	client: ReturnType<typeof createApiClient<FormBuilderApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("formSubmissions", {
		list: (params: SubmissionListParams) => ({
			queryKey: [params],
			queryFn: async () => {
				try {
					const response: unknown = await client("/forms/:formId/submissions", {
						method: "GET",
						params: { formId: params.formId },
						query: {
							limit: params.limit ?? 20,
							offset: params.offset ?? 0,
						},
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown })
						.data as PaginatedFormSubmissions;
				} catch (error) {
					throw error;
				}
			},
		}),

		detail: (formId: string, subId: string) => ({
			queryKey: [formId, subId],
			queryFn: async () => {
				if (!formId || !subId) return null;

				try {
					const response: unknown = await client(
						"/forms/:formId/submissions/:subId",
						{
							method: "GET",
							params: { formId, subId },
							headers,
						},
					);
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown })
						.data as SerializedFormSubmissionWithData | null;
				} catch (error) {
					throw error;
				}
			},
		}),
	});
}
