import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { blogSchema as dbSchema } from "../db";
import type { Post, PostWithPostTag, Tag } from "../types";
import { slugify } from "../utils";
import { createPostSchema, updatePostSchema } from "../schemas";

export const PostListQuerySchema = z.object({
	slug: z.string().optional(),
	tagSlug: z.string().optional(),
	offset: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	query: z.string().optional(),
	published: z
		.string()
		.optional()
		.transform((val) => {
			if (val === undefined) return undefined;
			if (val === "true") return true;
			if (val === "false") return false;
			return undefined;
		}),
});

export const NextPreviousPostsQuerySchema = z.object({
	date: z.coerce.date(),
});

/**
 * Context passed to blog API hooks
 */
export interface BlogApiContext<TBody = any, TParams = any, TQuery = any> {
	body?: TBody;
	params?: TParams;
	query?: TQuery;
	request?: Request;
	headers?: Headers;
	[key: string]: any;
}

/**
 * Configuration hooks for blog backend plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface BlogBackendHooks {
	/**
	 * Called before listing posts. Return false to deny access.
	 * @param filter - Query parameters for filtering posts
	 * @param context - Request context with headers, etc.
	 */
	onBeforeListPosts?: (
		filter: z.infer<typeof PostListQuerySchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before creating a post. Return false to deny access.
	 * @param data - Post data being created
	 * @param context - Request context with headers, etc.
	 */
	onBeforeCreatePost?: (
		data: z.infer<typeof createPostSchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before updating a post. Return false to deny access.
	 * @param postId - ID of the post being updated
	 * @param data - Updated post data
	 * @param context - Request context with headers, etc.
	 */
	onBeforeUpdatePost?: (
		postId: string,
		data: z.infer<typeof updatePostSchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before deleting a post. Return false to deny access.
	 * @param postId - ID of the post being deleted
	 * @param context - Request context with headers, etc.
	 */
	onBeforeDeletePost?: (
		postId: string,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;

	/**
	 * Called after posts are read successfully
	 * @param posts - Array of posts that were read
	 * @param filter - Query parameters used for filtering
	 * @param context - Request context
	 */
	onPostsRead?: (
		posts: Post[],
		filter: z.infer<typeof PostListQuerySchema>,
		context: BlogApiContext,
	) => Promise<void> | void;
	/**
	 * Called after a post is created successfully
	 * @param post - The created post
	 * @param context - Request context
	 */
	onPostCreated?: (post: Post, context: BlogApiContext) => Promise<void> | void;
	/**
	 * Called after a post is updated successfully
	 * @param post - The updated post
	 * @param context - Request context
	 */
	onPostUpdated?: (post: Post, context: BlogApiContext) => Promise<void> | void;
	/**
	 * Called after a post is deleted successfully
	 * @param postId - ID of the deleted post
	 * @param context - Request context
	 */
	onPostDeleted?: (
		postId: string,
		context: BlogApiContext,
	) => Promise<void> | void;

	/**
	 * Called when listing posts fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onListPostsError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
	/**
	 * Called when creating a post fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onCreatePostError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
	/**
	 * Called when updating a post fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onUpdatePostError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
	/**
	 * Called when deleting a post fails
	 * @param error - The error that occurred
	 * @param context - Request context
	 */
	onDeletePostError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
}

/**
 * Blog backend plugin
 * Provides API endpoints for managing blog posts
 * Uses better-db adapter for database operations
 *
 * @param hooks - Optional configuration hooks for customizing plugin behavior
 */
export const blogBackendPlugin = (hooks?: BlogBackendHooks) =>
	defineBackendPlugin({
		name: "blog",

		dbPlugin: dbSchema,

		routes: (adapter: Adapter) => {
			const findOrCreateTags = async (
				tagInputs: Array<
					{ name: string } | { id: string; name: string; slug: string }
				>,
			): Promise<Tag[]> => {
				if (tagInputs.length === 0) return [];

				const normalizeTagName = (name: string): string => {
					return name.trim();
				};

				const tagsWithIds: Tag[] = [];
				const tagsToFindOrCreate: Array<{ name: string }> = [];

				for (const tagInput of tagInputs) {
					if ("id" in tagInput && tagInput.id) {
						tagsWithIds.push({
							id: tagInput.id,
							name: normalizeTagName(tagInput.name),
							slug: tagInput.slug,
							createdAt: new Date(),
							updatedAt: new Date(),
						} as Tag);
					} else {
						tagsToFindOrCreate.push({ name: normalizeTagName(tagInput.name) });
					}
				}

				if (tagsToFindOrCreate.length === 0) {
					return tagsWithIds;
				}

				const allTags = await adapter.findMany<Tag>({
					model: "tag",
				});
				const tagMapBySlug = new Map<string, Tag>();
				for (const tag of allTags) {
					tagMapBySlug.set(tag.slug, tag);
				}

				const tagSlugs = tagsToFindOrCreate.map((tag) => slugify(tag.name));
				const foundTags: Tag[] = [];

				for (const slug of tagSlugs) {
					const tag = tagMapBySlug.get(slug);
					if (tag) {
						foundTags.push(tag);
					}
				}

				const existingSlugs = new Set([
					...tagsWithIds.map((tag) => tag.slug),
					...foundTags.map((tag) => tag.slug),
				]);
				const tagsToCreate = tagsToFindOrCreate.filter(
					(tag) => !existingSlugs.has(slugify(tag.name)),
				);

				const createdTags: Tag[] = [];
				for (const tag of tagsToCreate) {
					const normalizedName = normalizeTagName(tag.name);
					const newTag = await adapter.create<Tag>({
						model: "tag",
						data: {
							name: normalizedName,
							slug: slugify(normalizedName),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
					createdTags.push(newTag);
				}

				return [...tagsWithIds, ...foundTags, ...createdTags];
			};

			const listPosts = createEndpoint(
				"/posts",
				{
					method: "GET",
					query: PostListQuerySchema,
				},
				async (ctx) => {
					const { query, headers } = ctx;
					const context: BlogApiContext = { query, headers };

					try {
						if (hooks?.onBeforeListPosts) {
							const canList = await hooks.onBeforeListPosts(query, context);
							if (!canList) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot list posts",
								});
							}
						}

						let tagFilterPostIds: Set<string> | null = null;

						if (query.tagSlug) {
							const tag = await adapter.findOne<Tag>({
								model: "tag",
								where: [
									{
										field: "slug",
										value: query.tagSlug,
										operator: "eq" as const,
									},
								],
							});

							if (!tag) {
								return [];
							}

							const postTags = await adapter.findMany<{
								postId: string;
								tagId: string;
							}>({
								model: "postTag",
								where: [
									{
										field: "tagId",
										value: tag.id,
										operator: "eq" as const,
									},
								],
							});
							tagFilterPostIds = new Set(postTags.map((pt) => pt.postId));
							if (tagFilterPostIds.size === 0) {
								return [];
							}
						}

						const whereConditions = [];

						if (query.published !== undefined) {
							whereConditions.push({
								field: "published",
								value: query.published,
								operator: "eq" as const,
							});
						}

						if (query.slug) {
							whereConditions.push({
								field: "slug",
								value: query.slug,
								operator: "eq" as const,
							});
						}

						const posts = await adapter.findMany<PostWithPostTag>({
							model: "post",
							limit:
								query.query || query.tagSlug ? undefined : (query.limit ?? 10),
							offset:
								query.query || query.tagSlug ? undefined : (query.offset ?? 0),
							where: whereConditions,
							sortBy: {
								field: "createdAt",
								direction: "desc",
							},
							join: {
								postTag: true,
							},
						});

						// Collect unique tag IDs from joined postTag data
						const tagIds = new Set<string>();
						for (const post of posts) {
							if (post.postTag) {
								for (const pt of post.postTag) {
									tagIds.add(pt.tagId);
								}
							}
						}

						// Fetch all tags at once
						const tags =
							tagIds.size > 0
								? await adapter.findMany<Tag>({
										model: "tag",
									})
								: [];
						const tagMap = new Map<string, Tag>();
						for (const tag of tags) {
							if (tagIds.has(tag.id)) {
								tagMap.set(tag.id, tag);
							}
						}

						// Map tags to posts (spread to avoid circular references)
						let result = posts.map((post) => {
							const postTags = (post.postTag || [])
								.map((pt) => {
									const tag = tagMap.get(pt.tagId);
									return tag ? { ...tag } : undefined;
								})
								.filter((tag): tag is Tag => tag !== undefined);
							const { postTag: _, ...postWithoutJoin } = post;
							return {
								...postWithoutJoin,
								tags: postTags,
							};
						});

						if (tagFilterPostIds) {
							result = result.filter((post) => tagFilterPostIds!.has(post.id));
						}

						if (query.query) {
							const searchLower = query.query.toLowerCase();
							result = result.filter((post) => {
								const titleMatch = post.title
									?.toLowerCase()
									.includes(searchLower);
								const contentMatch = post.content
									?.toLowerCase()
									.includes(searchLower);
								const excerptMatch = post.excerpt
									?.toLowerCase()
									.includes(searchLower);
								return titleMatch || contentMatch || excerptMatch;
							});
						}

						if (query.tagSlug || query.query) {
							const offset = query.offset ?? 0;
							const limit = query.limit ?? 10;
							result = result.slice(offset, offset + limit);
						}

						if (hooks?.onPostsRead) {
							await hooks.onPostsRead(result, query, context);
						}

						return result;
					} catch (error) {
						if (hooks?.onListPostsError) {
							await hooks.onListPostsError(error as Error, context);
						}
						throw error;
					}
				},
			);
			const createPost = createEndpoint(
				"/posts",
				{
					method: "POST",
					body: createPostSchema,
				},
				async (ctx) => {
					const context: BlogApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeCreatePost) {
							const canCreate = await hooks.onBeforeCreatePost(
								ctx.body,
								context,
							);
							if (!canCreate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot create post",
								});
							}
						}

						const { tags, ...postData } = ctx.body;
						const tagNames = tags || [];

						const newPost = await adapter.create<Post>({
							model: "post",
							data: {
								...postData,
								// Always slugify to ensure URL-safe slug, whether provided or generated from title
								slug: slugify(postData.slug || postData.title),
								tags: [],
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						if (tagNames.length > 0) {
							const createdTags = await findOrCreateTags(tagNames);

							await adapter.transaction(async (tx) => {
								for (const tag of createdTags) {
									await tx.create<{ postId: string; tagId: string }>({
										model: "postTag",
										data: {
											postId: newPost.id,
											tagId: tag.id,
										},
									});
								}
							});

							newPost.tags = createdTags.map((tag) => ({ ...tag }));
						} else {
							newPost.tags = [];
						}

						if (hooks?.onPostCreated) {
							await hooks.onPostCreated(newPost, context);
						}

						return newPost;
					} catch (error) {
						if (hooks?.onCreatePostError) {
							await hooks.onCreatePostError(error as Error, context);
						}
						throw error;
					}
				},
			);
			const updatePost = createEndpoint(
				"/posts/:id",
				{
					method: "PUT",
					body: updatePostSchema,
				},
				async (ctx) => {
					const context: BlogApiContext = {
						body: ctx.body,
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						if (hooks?.onBeforeUpdatePost) {
							const canUpdate = await hooks.onBeforeUpdatePost(
								ctx.params.id,
								ctx.body,
								context,
							);
							if (!canUpdate) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot update post",
								});
							}
						}

						const { tags, slug, ...restPostData } = ctx.body;
						const tagNames = tags || [];

						// Sanitize slug if provided to ensure it's URL-safe
						const postData = {
							...restPostData,
							...(slug ? { slug: slugify(slug) } : {}),
						};

						const updated = await adapter.transaction(async (tx) => {
							const existingPostTags = await tx.findMany<{
								postId: string;
								tagId: string;
							}>({
								model: "postTag",
								where: [
									{
										field: "postId",
										value: ctx.params.id,
										operator: "eq" as const,
									},
								],
							});

							const updatedPost = await tx.update<Post>({
								model: "post",
								where: [{ field: "id", value: ctx.params.id }],
								update: {
									...postData,
									updatedAt: new Date(),
								},
							});

							if (!updatedPost) {
								throw ctx.error(404, {
									message: "Post not found",
								});
							}

							for (const postTag of existingPostTags) {
								await tx.delete<{ postId: string; tagId: string }>({
									model: "postTag",
									where: [
										{
											field: "postId",
											value: postTag.postId,
											operator: "eq" as const,
										},
										{
											field: "tagId",
											value: postTag.tagId,
											operator: "eq" as const,
										},
									],
								});
							}

							if (tagNames.length > 0) {
								const createdTags = await findOrCreateTags(tagNames);

								for (const tag of createdTags) {
									await tx.create<{ postId: string; tagId: string }>({
										model: "postTag",
										data: {
											postId: ctx.params.id,
											tagId: tag.id,
										},
									});
								}

								updatedPost.tags = createdTags.map((tag) => ({ ...tag }));
							} else {
								updatedPost.tags = [];
							}

							return updatedPost;
						});

						if (hooks?.onPostUpdated) {
							await hooks.onPostUpdated(updated, context);
						}

						return updated;
					} catch (error) {
						if (hooks?.onUpdatePostError) {
							await hooks.onUpdatePostError(error as Error, context);
						}
						throw error;
					}
				},
			);
			const deletePost = createEndpoint(
				"/posts/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const context: BlogApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					try {
						// Authorization hook
						if (hooks?.onBeforeDeletePost) {
							const canDelete = await hooks.onBeforeDeletePost(
								ctx.params.id,
								context,
							);
							if (!canDelete) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot delete post",
								});
							}
						}

						await adapter.delete<Post>({
							model: "post",
							where: [{ field: "id", value: ctx.params.id }],
						});

						// Lifecycle hook
						if (hooks?.onPostDeleted) {
							await hooks.onPostDeleted(ctx.params.id, context);
						}

						return { success: true };
					} catch (error) {
						// Error hook
						if (hooks?.onDeletePostError) {
							await hooks.onDeletePostError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const getNextPreviousPosts = createEndpoint(
				"/posts/next-previous",
				{
					method: "GET",
					query: NextPreviousPostsQuerySchema,
				},
				async (ctx) => {
					const { query, headers } = ctx;
					const context: BlogApiContext = { query, headers };

					try {
						if (hooks?.onBeforeListPosts) {
							const canList = await hooks.onBeforeListPosts(
								{ published: true },
								context,
							);
							if (!canList) {
								throw ctx.error(403, {
									message: "Unauthorized: Cannot list posts",
								});
							}
						}

						const date = query.date;

						// Get previous post (createdAt < date, newest first)
						const previousPosts = await adapter.findMany<PostWithPostTag>({
							model: "post",
							limit: 1,
							where: [
								{
									field: "createdAt",
									value: date,
									operator: "lt" as const,
								},
								{
									field: "published",
									value: true,
									operator: "eq" as const,
								},
							],
							sortBy: {
								field: "createdAt",
								direction: "desc",
							},
							join: {
								postTag: true,
							},
						});

						const nextPosts = await adapter.findMany<PostWithPostTag>({
							model: "post",
							limit: 1,
							where: [
								{
									field: "createdAt",
									value: date,
									operator: "gt" as const,
								},
								{
									field: "published",
									value: true,
									operator: "eq" as const,
								},
							],
							sortBy: {
								field: "createdAt",
								direction: "asc",
							},
							join: {
								postTag: true,
							},
						});

						// Collect unique tag IDs from joined data
						const tagIds = new Set<string>();
						const allPosts = [...previousPosts, ...nextPosts];
						for (const post of allPosts) {
							if (post.postTag) {
								for (const pt of post.postTag) {
									tagIds.add(pt.tagId);
								}
							}
						}

						// Fetch tags if needed
						const tagMap = new Map<string, Tag>();
						if (tagIds.size > 0) {
							const tags = await adapter.findMany<Tag>({
								model: "tag",
							});
							for (const tag of tags) {
								if (tagIds.has(tag.id)) {
									tagMap.set(tag.id, tag);
								}
							}
						}

						// Helper to map post with tags (spread to avoid circular references)
						const mapPostWithTags = (post: PostWithPostTag) => {
							const tags = (post.postTag || [])
								.map((pt) => {
									const tag = tagMap.get(pt.tagId);
									return tag ? { ...tag } : undefined;
								})
								.filter((tag): tag is Tag => tag !== undefined);
							const { postTag: _, ...postWithoutJoin } = post;
							return {
								...postWithoutJoin,
								tags,
							};
						};

						return {
							previous: previousPosts[0]
								? mapPostWithTags(previousPosts[0])
								: null,
							next: nextPosts[0] ? mapPostWithTags(nextPosts[0]) : null,
						};
					} catch (error) {
						// Error hook
						if (hooks?.onListPostsError) {
							await hooks.onListPostsError(error as Error, context);
						}
						throw error;
					}
				},
			);

			const listTags = createEndpoint(
				"/tags",
				{
					method: "GET",
				},
				async () => {
					return await adapter.findMany<Tag>({
						model: "tag",
					});
				},
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
