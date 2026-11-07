import type { BlogApiRouter } from "./api";
import type { StackIdentity } from "@btst/stack/context";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { z } from "zod";
import type { createPostSchema, updatePostSchema } from "./schemas";
import type {
	SerializedPost,
	SerializedEditorialPost,
	SerializedPostRevision,
	SerializedTag,
} from "./types";
import {
	postsListDiscriminator,
	type EditorialQueryScope,
} from "./api/query-key-defs";

/** Private history cache discriminator; never sent to the API. */
export type BlogRevisionIdentityPartition =
	| StackIdentity
	| "anonymous"
	| { identity: StackIdentity | null; generation: number }
	| `pending:${number}`
	| `error:${number}`;

interface PostsListParams {
	query?: string;
	limit?: number;
	published?: boolean;
	tagSlug?: string;
}

type PostCreateInput = z.infer<typeof createPostSchema>;
type PostUpdateInput = z.infer<typeof updatePostSchema>;

/** Optimistic preconditions for a decision on the current saved revision. */
export interface EditorialDecisionInput {
	id: string;
	expectedVersion: number;
	expectedEditorialVersion: number;
}

function publicDetailArgs(post: SerializedPost | null) {
	if (
		!post?.slug ||
		(post as Partial<SerializedEditorialPost>).editorial?.enabled
	)
		return null;
	return [post.slug];
}

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
				invalidates: ["posts.list", "drafts.list", "postRevisions", "tags"],
				setData: {
					query: "detail",
					args: publicDetailArgs,
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
				invalidates: ["posts.list", "drafts.list", "postRevisions", "tags"],
				setData: {
					query: "detail",
					args: publicDetailArgs,
				},
			},
			restoreRevision: {
				path: "@post/posts/:id/revisions/:revisionId/restore",
				method: "POST" as const,
				input: (vars: {
					id: string;
					revisionId: string;
					expectedVersion: number;
				}) => ({
					params: { id: vars.id, revisionId: vars.revisionId },
					body: { expectedVersion: vars.expectedVersion },
				}),
				select: (data: any) => data as SerializedPost,
				invalidates: ["posts", "drafts.list", "postRevisions", "tags"],
				setData: {
					query: "detail",
					args: publicDetailArgs,
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

	editorialPosts: {
		queries: {
			detail: {
				path: "/posts/editorial",
				query: (slug: string, _scope: EditorialQueryScope) => ({ slug }),
				key: (slug: string, scope: EditorialQueryScope) => [slug, scope],
				select: (data: any): SerializedEditorialPost | null => data ?? null,
				skip: (slug: string, scope: EditorialQueryScope) =>
					!slug || typeof scope.identity === "string",
			},
		},
		mutations: {
			submit: {
				path: "@post/posts/:id/submit",
				method: "POST" as const,
				input: (vars: EditorialDecisionInput) => {
					const { id, ...body } = vars;
					return { params: { id }, body };
				},
				select: (data: any) => data as SerializedEditorialPost,
				refresh: false,
			},
			requestChanges: {
				path: "@post/posts/:id/request-changes",
				method: "POST" as const,
				input: (vars: EditorialDecisionInput & { comment?: string }) => {
					const { id, ...body } = vars;
					return { params: { id }, body };
				},
				select: (data: any) => data as SerializedEditorialPost,
				refresh: false,
			},
			approve: {
				path: "@post/posts/:id/approve",
				method: "POST" as const,
				input: (vars: EditorialDecisionInput) => {
					const { id, ...body } = vars;
					return { params: { id }, body };
				},
				select: (data: any) => data as SerializedEditorialPost,
				refresh: false,
			},
			publish: {
				path: "@post/posts/:id/publish",
				method: "POST" as const,
				input: (vars: EditorialDecisionInput & { published?: boolean }) => {
					const { id, ...body } = vars;
					return { params: { id }, body };
				},
				select: (data: any) => data as SerializedEditorialPost,
				refresh: false,
			},
		},
	},

	postRevisions: {
		queries: {
			list: {
				path: "/posts/:id/revisions",
				params: (id: string, _identity?: BlogRevisionIdentityPartition) => ({
					id,
				}),
				key: (id: string, identity?: BlogRevisionIdentityPartition) =>
					identity === undefined ? [id] : [id, identity],
				select: (
					data: any,
				): { items: SerializedPostRevision[]; total: number } =>
					data ?? { items: [], total: 0 },
				infinite: true,
				pageSize: () => 20,
				nextPageParam: (
					lastPage: { items: SerializedPostRevision[]; total: number },
					allPages: { items: SerializedPostRevision[]; total: number }[],
				) => {
					const loaded = allPages.reduce(
						(count, page) => count + page.items.length,
						0,
					);
					return lastPage.items.length === 20 && loaded < lastPage.total
						? loaded
						: undefined;
				},
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
