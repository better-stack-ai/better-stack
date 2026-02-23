import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { BlogApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type { SerializedPost, SerializedTag } from "./types";

interface PostsListParams {
	query?: string;
	limit?: number;
	published?: boolean;
	tagSlug?: string;
}

// Type guard for better-call error responses
// better-call client returns Error$1<unknown> | Data<T>
// We check if error exists and is not null/undefined to determine it's an error response
function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		response.error !== null &&
		response.error !== undefined
	);
}

// Helper to convert error to a proper Error object with meaningful message
function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	// Handle object errors (likely from better-call APIError)
	if (typeof error === "object" && error !== null) {
		// Try to extract message from common error object structures
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			(typeof errorObj.error === "string" ? errorObj.error : null) ||
			JSON.stringify(error);

		const err = new Error(message);
		// Preserve other properties
		Object.assign(err, error);
		return err;
	}

	// Fallback for primitive values
	return new Error(String(error));
}

export function createBlogQueryKeys(
	client: ReturnType<typeof createApiClient<BlogApiRouter>>,
	headers?: HeadersInit,
) {
	const posts = createPostsQueries(client, headers);
	const drafts = createDraftsQueries(client, headers);
	const tags = createTagsQueries(client, headers);

	return mergeQueryKeys(posts, drafts, tags);
}

function createPostsQueries(
	client: ReturnType<typeof createApiClient<BlogApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("posts", {
		list: (params?: PostsListParams) => ({
			queryKey: [
				{
					query:
						params?.query !== undefined && params?.query?.trim() === ""
							? undefined
							: params?.query,
					limit: params?.limit ?? 10,
					published: params?.published ?? true,
					tagSlug: params?.tagSlug,
				},
			],
			queryFn: async ({ pageParam }: { pageParam?: number }) => {
				try {
					const response = await client("/posts", {
						method: "GET",
						query: {
							query: params?.query,
							offset: pageParam ?? 0,
							limit: params?.limit ?? 10,
							published:
								params?.published !== undefined
									? params.published
										? "true"
										: "false"
									: undefined,
							tagSlug: params?.tagSlug,
						},
						headers,
					});
					// Check for errors (better-call returns Error$1<unknown> | Data<PostListResult>)
					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}
					// Extract .items from the paginated response for infinite scroll compatibility
					const dataResponse = response as { data?: { items?: unknown[] } };
					return (dataResponse.data?.items ??
						[]) as unknown as SerializedPost[];
				} catch (error) {
					// Re-throw errors so React Query can catch them
					throw error;
				}
			},
		}),

		// Simplified detail query
		detail: (slug: string) => ({
			queryKey: [slug],
			queryFn: async () => {
				if (!slug) return null;

				try {
					const response = await client("/posts", {
						method: "GET",
						query: { slug, limit: 1 },
						headers,
					});
					// Check for errors (better-call returns Error$1<unknown> | Data<PostListResult>)
					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}
					// Type narrowed to Data<PostListResult> after error check — access .items[0]
					const dataResponse = response as { data?: { items?: unknown[] } };
					return (dataResponse.data?.items?.[0] ??
						null) as unknown as SerializedPost | null;
				} catch (error) {
					// Re-throw errors so React Query can catch them
					throw error;
				}
			},
		}),

		// Next/previous posts query
		nextPrevious: (date: Date | string) => ({
			queryKey: ["nextPrevious", date],
			queryFn: async () => {
				const dateValue = typeof date === "string" ? new Date(date) : date;
				const response = await client("/posts/next-previous", {
					method: "GET",
					query: {
						date: dateValue.toISOString(),
					},
					headers,
				});
				// Check for errors (better-call returns Error$1<unknown> | Data<...>)
				if (isErrorResponse(response)) {
					const errorResponse = response as { error: unknown };
					throw toError(errorResponse.error);
				}
				// Type narrowed to Data<...> after error check
				const dataResponse = response as { data?: unknown };
				return dataResponse.data as {
					previous: SerializedPost | null;
					next: SerializedPost | null;
				};
			},
		}),

		// Recent posts query (separate from main list to avoid cache conflicts)
		recent: (params?: { limit?: number; excludeSlug?: string }) => ({
			queryKey: ["recent", params],
			queryFn: async () => {
				try {
					const response = await client("/posts", {
						method: "GET",
						query: {
							limit: params?.limit ?? 5,
							published: "true",
						},
						headers,
					});
					// Check for errors (better-call returns Error$1<unknown> | Data<PostListResult>)
					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}
					// Extract .items from the paginated response
					const recentResponse = response as { data?: { items?: unknown[] } };
					let posts = (recentResponse.data?.items ??
						[]) as unknown as SerializedPost[];

					// Exclude current post if specified
					if (params?.excludeSlug) {
						posts = posts.filter((post) => post.slug !== params.excludeSlug);
					}

					return posts;
				} catch (error) {
					// Re-throw errors so React Query can catch them
					throw error;
				}
			},
		}),
	});
}

function createDraftsQueries(
	client: ReturnType<typeof createApiClient<BlogApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("drafts", {
		list: (params?: PostsListParams) => ({
			queryKey: [
				{
					...(params?.limit && { limit: params.limit }),
				},
			],
			queryFn: async ({ pageParam }: { pageParam?: number }) => {
				try {
					const response = await client("/posts", {
						method: "GET",
						query: {
							query: params?.query,
							offset: pageParam ?? 0,
							limit: params?.limit ?? 10,
							published: "false",
						},
						headers,
					});
					// Check for errors (better-call returns Error$1<unknown> | Data<PostListResult>)
					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}
					// Extract .items from the paginated response for infinite scroll compatibility
					const draftsResponse = response as { data?: { items?: unknown[] } };
					return (draftsResponse.data?.items ??
						[]) as unknown as SerializedPost[];
				} catch (error) {
					// Re-throw errors so React Query can catch them
					throw error;
				}
			},
		}),
	});
}

function createTagsQueries(
	client: ReturnType<typeof createApiClient<BlogApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("tags", {
		list: () => ({
			queryKey: ["tags"],
			queryFn: async () => {
				try {
					const response = await client("/tags", {
						method: "GET",
						headers,
					});
					// Check for errors (better-call returns Error$1<unknown> | Data<Tag[]>)
					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}
					// Type narrowed to Data<Tag[]> after error check
					// The API returns serialized tags (dates as strings)
					return ((response as { data?: unknown }).data ??
						[]) as unknown as SerializedTag[];
				} catch (error) {
					// Re-throw errors so React Query can catch them
					throw error;
				}
			},
		}),
	});
}
