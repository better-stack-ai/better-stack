import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { CMSApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type {
	SerializedContentType,
	SerializedContentItemWithType,
	PaginatedContentItems,
} from "./types";
import { contentListDiscriminator } from "./api/query-key-defs";

interface ContentListParams {
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
 * Create CMS query keys for React Query
 * Used by consumers to fetch content types and content items
 */
export function createCMSQueryKeys(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
) {
	const contentTypes = createContentTypesQueries(client, headers);
	const content = createContentQueries(client, headers);

	return mergeQueryKeys(contentTypes, content);
}

function createContentTypesQueries(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("cmsTypes", {
		list: () => ({
			queryKey: ["list"],
			queryFn: async () => {
				try {
					const response: unknown = await client("/content-types", {
						method: "GET",
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return ((response as { data?: unknown }).data ??
						[]) as (SerializedContentType & { itemCount: number })[];
				} catch (error) {
					throw error;
				}
			},
		}),

		detail: (slug: string) => ({
			queryKey: [slug],
			queryFn: async () => {
				if (!slug) return null;

				try {
					const response: unknown = await client("/content-types/:slug", {
						method: "GET",
						params: { slug },
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown })
						.data as SerializedContentType | null;
				} catch (error) {
					throw error;
				}
			},
		}),
	});
}

function createContentQueries(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("cmsContent", {
		list: (params: { typeSlug: string } & ContentListParams) => ({
			queryKey: [contentListDiscriminator(params)],
			queryFn: async () => {
				try {
					const response: unknown = await client("/content/:typeSlug", {
						method: "GET",
						params: { typeSlug: params.typeSlug },
						query: {
							limit: params.limit ?? 20,
							offset: params.offset ?? 0,
						},
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown }).data as PaginatedContentItems;
				} catch (error) {
					throw error;
				}
			},
		}),

		detail: (typeSlug: string, id: string) => ({
			queryKey: [typeSlug, id],
			queryFn: async () => {
				if (!typeSlug || !id) return null;

				try {
					const response: unknown = await client("/content/:typeSlug/:id", {
						method: "GET",
						params: { typeSlug, id },
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					return (response as { data?: unknown })
						.data as SerializedContentItemWithType | null;
				} catch (error) {
					throw error;
				}
			},
		}),

		bySlug: (typeSlug: string, slug: string) => ({
			queryKey: ["bySlug", typeSlug, slug],
			queryFn: async () => {
				if (!typeSlug || !slug) return null;

				try {
					const response: unknown = await client("/content/:typeSlug", {
						method: "GET",
						params: { typeSlug },
						query: { slug, limit: 1 },
						headers,
					});
					if (isErrorResponse(response)) {
						throw toError(response.error);
					}
					const data = (response as { data?: unknown })
						.data as PaginatedContentItems;
					return data.items[0] ?? null;
				} catch (error) {
					throw error;
				}
			},
		}),
	});
}
