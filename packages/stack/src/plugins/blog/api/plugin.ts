import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { AuthorizationError } from "../../../authorization/server";
import { blogSchema as dbSchema } from "../db";
import { getAllPosts, getAllTags, getPostBySlug } from "./getters";
import {
	createPost as createPostMutation,
	deletePost as deletePostMutation,
	type CreatePostInput,
	type UpdatePostInput,
	updatePost as updatePostMutation,
} from "./mutations";
import {
	BlogOperationError,
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

type EndpointErrorFactory = (...args: any[]) => Error;

async function adaptOperationToHttp<TResult>(
	execute: () => Promise<TResult>,
	error: EndpointErrorFactory,
): Promise<TResult> {
	try {
		return await execute();
	} catch (cause) {
		if (
			cause instanceof AuthorizationError ||
			cause instanceof BlogOperationError
		) {
			throw error(cause.statusCode, {
				message: cause.message,
				code: cause.code,
			});
		}
		throw cause;
	}
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
			getAllPosts: (params?: Parameters<typeof getAllPosts>[1]) =>
				getAllPosts(adapter, params),
			getPostBySlug: (slug: string) => getPostBySlug(adapter, slug),
			getAllTags: () => getAllTags(adapter),
			prefetchForRoute: createBlogPrefetchForRoute(adapter),
			createPost: (input: CreatePostInput) =>
				createPostMutation(adapter, input),
			updatePost: (id: string, input: UpdatePostInput) =>
				updatePostMutation(adapter, id, input),
			deletePost: (id: string) => deletePostMutation(adapter, id),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listPosts = createEndpoint(
				"/posts",
				{ method: "GET", query: PostListQuerySchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.listPosts(ctx.query, ctx.request),
						ctx.error,
					),
			);

			const createPost = createEndpoint(
				"/posts",
				{
					method: "POST",
					body: CreatePostOperationInputSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createPost(ctx.body, ctx.request),
						ctx.error,
					),
			);

			const updatePost = createEndpoint(
				"/posts/:id",
				{
					method: "PUT",
					body: UpdatePostOperationInputSchema.shape.data,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updatePost(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);

			const deletePost = createEndpoint(
				"/posts/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deletePost({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);

			const getNextPreviousPosts = createEndpoint(
				"/posts/next-previous",
				{
					method: "GET",
					query: NextPreviousPostsQuerySchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getNextPreviousPosts(ctx.query, ctx.request),
						ctx.error,
					),
			);

			const listTags = createEndpoint(
				"/tags",
				{ method: "GET", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.listTags({}, ctx.request),
						ctx.error,
					),
			);

			return {
				listPosts: operations.listPosts.route(listPosts),
				createPost: operations.createPost.route(createPost),
				updatePost: operations.updatePost.route(updatePost),
				deletePost: operations.deletePost.route(deletePost),
				getNextPreviousPosts:
					operations.getNextPreviousPosts.route(getNextPreviousPosts),
				listTags: operations.listTags.route(listTags),
			} as const;
		},
	});

export type BlogApiRouter = ReturnType<
	ReturnType<typeof blogBackendPlugin>["routes"]
>;
