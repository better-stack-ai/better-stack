import type { BlogApiRouter } from "./api";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { z } from "zod";
import type { createPostSchema, updatePostSchema } from "./schemas";
import type { SerializedPost, SerializedTag } from "./types";
import { postsListDiscriminator } from "./api/query-key-defs";

interface PostsListParams {
	query?: string;
	limit?: number;
	published?: boolean;
	tagSlug?: string;
}

type PostCreateInput = z.infer<typeof createPostSchema>;
type PostUpdateInput = z.infer<typeof updatePostSchema>;

/**
 * Blog resource declaration — the single source of truth for query keys,
 * HTTP mappings and mutations. Feeds both `createBlogQueryKeys` (SSR
 * loaders) and `createResource` (client hooks, see `client/hooks`).
 *
 * Key shapes intentionally match `BLOG_QUERY_KEYS` in
 * `api/query-key-defs.ts` so SSG `prefetchForRoute` hydration keeps working.
 */
export const blogResources = {
	posts: {
		queries: {
			list: {
				path: "/posts",
				query: (params?: PostsListParams) => ({
					query: params?.query,
					limit: params?.limit ?? 10,
					published:
						params?.published !== undefined
							? params.published
								? "true"
								: "false"
							: undefined,
					tagSlug: params?.tagSlug,
				}),
				key: (params?: PostsListParams) => [
					postsListDiscriminator({
						published: params?.published ?? true,
						limit: params?.limit ?? 10,
						tagSlug: params?.tagSlug,
						query: params?.query,
					}),
				],
				select: (data: any, _params?: PostsListParams): SerializedPost[] =>
					data?.items ?? [],
				infinite: true,
				pageSize: (params?: PostsListParams) => params?.limit ?? 10,
			},

			detail: {
				path: "/posts",
				query: (slug: string) => ({ slug, limit: 1 }),
				key: (slug: string) => [slug],
				select: (data: any, _slug: string): SerializedPost | null =>
					data?.items?.[0] ?? null,
				skip: (slug: string) => !slug,
			},

			nextPrevious: {
				path: "/posts/next-previous",
				query: (date: Date | string) => ({
					date: (typeof date === "string"
						? new Date(date)
						: date
					).toISOString(),
				}),
				key: (date: Date | string) => ["nextPrevious", date],
				select: (
					data: any,
					_date: Date | string,
				): {
					previous: SerializedPost | null;
					next: SerializedPost | null;
				} => data,
			},

			// Recent posts query (separate from the main list to avoid cache conflicts)
			recent: {
				path: "/posts",
				query: (params?: { limit?: number; excludeSlug?: string }) => ({
					limit: params?.limit ?? 5,
					published: "true",
				}),
				key: (params?: { limit?: number; excludeSlug?: string }) => [
					"recent",
					params,
				],
				select: (
					data: any,
					params?: { limit?: number; excludeSlug?: string },
				): SerializedPost[] => {
					const posts: SerializedPost[] = data?.items ?? [];
					return params?.excludeSlug
						? posts.filter((post) => post.slug !== params.excludeSlug)
						: posts;
				},
			},
		},

		mutations: {
			create: {
				path: "@post/posts",
				method: "POST" as const,
				input: (vars: PostCreateInput) => ({ body: vars }),
				select: (data: any) => data as SerializedPost | null,
				invalidates: ["posts.list", "drafts.list"],
				setData: {
					query: "detail",
					args: (created: SerializedPost | null) =>
						created?.slug ? [created.slug] : null,
				},
			},
			update: {
				path: "@put/posts/:id",
				method: "PUT" as const,
				input: (vars: { id: string; data: PostUpdateInput }) => ({
					params: { id: vars.id },
					body: vars.data,
				}),
				select: (data: any) => data as SerializedPost | null,
				invalidates: ["posts.list", "drafts.list"],
				setData: {
					query: "detail",
					args: (updated: SerializedPost | null) =>
						updated?.slug ? [updated.slug] : null,
				},
			},
			delete: {
				path: "@delete/posts/:id",
				method: "DELETE" as const,
				input: (vars: { id: string }) => ({ params: { id: vars.id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["posts", "drafts.list"],
			},
		},
	},

	drafts: {
		queries: {
			list: {
				path: "/posts",
				query: (params?: PostsListParams) => ({
					query: params?.query,
					limit: params?.limit ?? 10,
					published: "false",
				}),
				key: (params?: PostsListParams) => [
					{
						...(params?.limit && { limit: params.limit }),
					},
				],
				select: (data: any, _params?: PostsListParams): SerializedPost[] =>
					data?.items ?? [],
				infinite: true,
				pageSize: (params?: PostsListParams) => params?.limit ?? 10,
			},
		},
	},

	tags: {
		queries: {
			list: {
				path: "/tags",
				key: () => ["tags"],
				// The API returns serialized tags (dates as strings)
				select: (data: any): SerializedTag[] => data ?? [],
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createBlogQueryKeys(
	client: ReturnType<typeof createApiClient<BlogApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, blogResources, headers);
}
