import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { blogSchema as dbSchema } from "../db";
import { getAllPosts, getAllTags, getPostBySlug } from "./getters";
import {
	CreatePostOperationInputSchema,
	NextPreviousPostsQuerySchema,
	PostListQuerySchema,
	PostRevisionListQuerySchema,
	RestorePostRevisionInputSchema,
	UpdatePostOperationInputSchema,
	createBlogOperations,
	type BlogBackendHooks,
} from "./operations";
import {
	getEditorialWorkingPost,
	EditorialPostQuerySchema,
	EditorialTransitionInputSchema,
	RequestPostChangesInputSchema,
	PublishPostInputSchema,
} from "./editorial";
import { BLOG_QUERY_KEYS } from "./query-key-defs";
import { serializePost, serializeTag } from "./serializers";

export {
	CreatePostOperationInputSchema,
	NextPreviousPostsQuerySchema,
	PostListQuerySchema,
	UpdatePostOperationInputSchema,
} from "./operations";
export { BLOG_LIFECYCLE_HOOK_MIGRATIONS } from "./lifecycle-migrations";
export type {
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
 * SSG is a raw-data path: it intentionally bypasses request
 * authorization and seeds only the route data selected by the caller. Build
 * protected routes only when the resulting artifact has equivalent deployment
 * access controls; static output is commonly public.
 */
function createBlogPrefetchForRoute(
	adapter: Adapter,
	editorialWorkflow = false,
): BlogPrefetchForRoute {
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
					const working =
						key === "editPost"
							? await getEditorialWorkingPost(adapter, slug)
							: null;
					if (
						key === "editPost" &&
						(editorialWorkflow || working?.editorialEnabled)
					) {
						// Editorial queries require the request's identity and API endpoint cache partition.
						break;
					}
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
 * operation exposed by `forRequest(request).operations.blog` and `trusted.blog`.
 */
export interface BlogBackendOptions {
	/** Require revision submission and approval before publication. Defaults to false. */
	editorialWorkflow?: boolean;
	/** Post-authorization domain lifecycle hooks. */
	hooks?: BlogBackendHooks;
}

export const blogBackendPlugin = (options: BlogBackendOptions = {}) =>
	defineBackendPlugin({
		id: "blog",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createBlogOperations(adapter, options.hooks, options.editorialWorkflow),

		/**
		 * Explicit lower-level helper for SSG and infrastructure code.
		 * These functions bypass authorization and lifecycle composition.
		 */
		raw: (adapter: Adapter) => ({
			prefetchForRoute: createBlogPrefetchForRoute(
				adapter,
				options.editorialWorkflow,
			),
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

			const listPostRevisions = createEndpoint(
				"/posts/:id/revisions",
				{
					method: "GET",
					query: PostRevisionListQuerySchema,
					requireRequest: true,
				},
				operations.listPostRevisions.route((ctx) => ({
					id: ctx.params.id,
					...ctx.query,
				})),
			);
			const restorePostRevision = createEndpoint(
				"/posts/:id/revisions/:revisionId/restore",
				{
					method: "POST",
					body: RestorePostRevisionInputSchema.omit({
						id: true,
						revisionId: true,
					}),
					requireRequest: true,
				},
				operations.restorePostRevision.route((ctx) => ({
					id: ctx.params.id,
					revisionId: ctx.params.revisionId,
					...ctx.body,
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

			const getEditorialPost = createEndpoint(
				"/posts/editorial",
				{
					method: "GET",
					query: EditorialPostQuerySchema,
					requireRequest: true,
				},
				operations.getEditorialPost.route((ctx) => ctx.query),
			);
			const submitPost = createEndpoint(
				"/posts/:id/submit",
				{
					method: "POST",
					body: EditorialTransitionInputSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.submitPost.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			);
			const requestPostChanges = createEndpoint(
				"/posts/:id/request-changes",
				{
					method: "POST",
					body: RequestPostChangesInputSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.requestPostChanges.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			);
			const approvePost = createEndpoint(
				"/posts/:id/approve",
				{
					method: "POST",
					body: EditorialTransitionInputSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.approvePost.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			);
			const publishPost = createEndpoint(
				"/posts/:id/publish",
				{
					method: "POST",
					body: PublishPostInputSchema.omit({ id: true }),
					requireRequest: true,
				},
				operations.publishPost.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			);
			return {
				getEditorialPost,
				submitPost,
				requestPostChanges,
				approvePost,
				publishPost,
				listPosts,
				listPostRevisions,
				restorePostRevision,
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

export type {
	BlogEditorialHooks,
	BlogEditorialTransitionContext,
} from "./editorial";
export {
	EditorialPostQuerySchema,
	EditorialTransitionInputSchema,
	RequestPostChangesInputSchema,
	PublishPostInputSchema,
} from "./editorial";
