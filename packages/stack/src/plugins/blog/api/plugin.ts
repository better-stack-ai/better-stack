import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { blogSchema as dbSchema } from "../db";
import { getAllPosts, getAllTags, getPostBySlug } from "./getters";
import {
	CreatePostOperationInputSchema,
	NextPreviousPostsQuerySchema,
	PostListQuerySchema,
	UpdatePostOperationInputSchema,
	createBlogOperations,
	type BlogBackendHooks,
} from "./operations";
import { BLOG_QUERY_KEYS } from "./query-key-defs";
import { serializePost, serializeTag } from "./serializers";

export {
	CreatePostOperationInputSchema,
	NextPreviousPostsQuerySchema,
	PostListQuerySchema,
	UpdatePostOperationInputSchema,
} from "./operations";
export type {
	BlogApiContext,
	BlogBackendHooks,
	BlogCreateErrorContext,
	BlogCreateOperationContext,
	BlogCreateResultContext,
	BlogDeleteErrorContext,
	BlogDeleteOperationContext,
	BlogDeleteResultContext,
	BlogListErrorContext,
	BlogListOperationContext,
	BlogListResultContext,
	BlogNextPreviousErrorContext,
	BlogNextPreviousOperationContext,
	BlogNextPreviousResultContext,
	BlogUpdateErrorContext,
	BlogUpdateOperationContext,
	BlogUpdateResultContext,
	SerializedNextPreviousPostsResult,
	SerializedPostListResult,
} from "./operations";

/** Route keys returned by the Blog client plugin. */
export type BlogRouteKey =
	| "posts"
	| "drafts"
	| "post"
	| "tag"
	| "newPost"
	| "editPost";

interface BlogPrefetchForRoute {
	(key: "posts" | "drafts" | "newPost", qc: QueryClient): Promise<void>;
	(
		key: "post" | "editPost",
		qc: QueryClient,
		params: { slug: string },
	): Promise<void>;
	(key: "tag", qc: QueryClient, params: { tagSlug: string }): Promise<void>;
}

/**
 * SSG is a trusted raw-data path: it intentionally bypasses request
 * authorization and seeds only the route data selected by the caller. Build
 * protected routes only when the resulting artifact has equivalent deployment
 * access controls; static output is commonly public.
 */
function createBlogPrefetchForRoute(adapter: Adapter): BlogPrefetchForRoute {
	return async function prefetchForRoute(
		key: BlogRouteKey,
		queryClient: QueryClient,
		params?: Record<string, string>,
	): Promise<void> {
		switch (key) {
			case "posts":
			case "drafts": {
				const published = key === "posts";
				const [result, tags] = await Promise.all([
					getAllPosts(adapter, { published, limit: 10 }),
					getAllTags(adapter),
				]);
				queryClient.setQueryData(
					BLOG_QUERY_KEYS.postsList({ published, limit: 10 }),
					{
						pages: [result.items.map(serializePost)],
						pageParams: [0],
					},
				);
				queryClient.setQueryData(
					BLOG_QUERY_KEYS.tagsList(),
					tags.map(serializeTag),
				);
				break;
			}
			case "post":
			case "editPost": {
				const slug = params?.slug ?? "";
				if (slug) {
					const post = await getPostBySlug(adapter, slug);
					queryClient.setQueryData(
						BLOG_QUERY_KEYS.postDetail(slug),
						post ? serializePost(post) : null,
					);
				}
				break;
			}
			case "tag": {
				const tagSlug = params?.tagSlug ?? "";
				const [result, tags] = await Promise.all([
					getAllPosts(adapter, { published: true, limit: 10, tagSlug }),
					getAllTags(adapter),
				]);
				queryClient.setQueryData(
					BLOG_QUERY_KEYS.postsList({ published: true, limit: 10, tagSlug }),
					{
						pages: [result.items.map(serializePost)],
						pageParams: [0],
					},
				);
				queryClient.setQueryData(
					BLOG_QUERY_KEYS.tagsList(),
					tags.map(serializeTag),
				);
				break;
			}
			default:
				break;
		}
	} as BlogPrefetchForRoute;
}

/**
 * Blog backend plugin. Every maintained HTTP endpoint adapts the same
 * operation exposed by `forRequest(request).api.blog` and `internal.blog`.
 */
export const blogBackendPlugin = (hooks?: BlogBackendHooks) =>
	defineBackendPlugin({
		name: "blog",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) => createBlogOperations(adapter, hooks),

		/**
		 * Explicit lower-level data API for SSG, jobs, and migration code.
		 * These functions bypass authorization and lifecycle composition.
		 */
		api: (adapter: Adapter) => ({
			prefetchForRoute: createBlogPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listPosts = createEndpoint(
				"/posts",
				{ method: "GET", query: PostListQuerySchema, requireRequest: true },
				operations.listPosts.route((ctx) => ctx.query),
			);

			const createPost = createEndpoint(
				"/posts",
				{
					method: "POST",
					body: CreatePostOperationInputSchema,
					requireRequest: true,
				},
				operations.createPost.route((ctx) => ctx.body),
			);

			const updatePost = createEndpoint(
				"/posts/:id",
				{
					method: "PUT",
					body: UpdatePostOperationInputSchema.shape.data,
					requireRequest: true,
				},
				operations.updatePost.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);

			const deletePost = createEndpoint(
				"/posts/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deletePost.route((ctx) => ({ id: ctx.params.id })),
			);

			const getNextPreviousPosts = createEndpoint(
				"/posts/next-previous",
				{
					method: "GET",
					query: NextPreviousPostsQuerySchema,
					requireRequest: true,
				},
				operations.getNextPreviousPosts.route((ctx) => ctx.query),
			);

			const listTags = createEndpoint(
				"/tags",
				{ method: "GET", requireRequest: true },
				operations.listTags.route(() => ({})),
			);

			return {
				listPosts,
				createPost,
				updatePost,
				deletePost,
				getNextPreviousPosts,
				listTags,
			} as const;
		},
	});

export type BlogApiRouter = ReturnType<
	ReturnType<typeof blogBackendPlugin>["routes"]
>;
