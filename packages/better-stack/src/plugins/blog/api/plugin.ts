import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { blogSchema as dbSchema } from "../db";
import type { Post, Tag } from "../types";
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
	// Hooks - called before the operation
	onBeforeListPosts?: (
		filter: z.infer<typeof PostListQuerySchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	onBeforeCreatePost?: (
		data: z.infer<typeof createPostSchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	onBeforeUpdatePost?: (
		postId: string,
		data: z.infer<typeof updatePostSchema>,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;
	onBeforeDeletePost?: (
		postId: string,
		context: BlogApiContext,
	) => Promise<boolean> | boolean;

	// Lifecycle hooks - called after the operation
	onPostsRead?: (
		posts: Post[],
		filter: z.infer<typeof PostListQuerySchema>,
		context: BlogApiContext,
	) => Promise<void> | void;
	onPostCreated?: (post: Post, context: BlogApiContext) => Promise<void> | void;
	onPostUpdated?: (post: Post, context: BlogApiContext) => Promise<void> | void;
	onPostDeleted?: (
		postId: string,
		context: BlogApiContext,
	) => Promise<void> | void;

	// Error hooks - called when operations fail
	onListPostsError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
	onCreatePostError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
	onUpdatePostError?: (
		error: Error,
		context: BlogApiContext,
	) => Promise<void> | void;
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
			const createTagCache = () => {
				let cache: Tag[] | null = null;
				return {
					getAllTags: async (): Promise<Tag[]> => {
						if (!cache) {
							cache = await adapter.findMany<Tag>({
								model: "tag",
							});
						}
						return cache;
					},
					invalidate: () => {
						cache = null;
					},
					addTag: (tag: Tag) => {
						if (cache) {
							cache.push(tag);
						}
					},
				};
			};

			const createPostTagCache = () => {
				let cache: Array<{ postId: string; tagId: string }> | null = null;
				const getAllPostTags = async (): Promise<
					Array<{ postId: string; tagId: string }>
				> => {
					if (!cache) {
						cache = await adapter.findMany<{
							postId: string;
							tagId: string;
						}>({
							model: "postTag",
						});
					}
					return cache;
				};
				return {
					getAllPostTags,
					invalidate: () => {
						cache = null;
					},
					getByTagId: async (
						tagId: string,
					): Promise<Array<{ postId: string; tagId: string }>> => {
						const allPostTags = await getAllPostTags();
						return allPostTags.filter((pt) => pt.tagId === tagId);
					},
					getByPostId: async (
						postId: string,
					): Promise<Array<{ postId: string; tagId: string }>> => {
						const allPostTags = await getAllPostTags();
						return allPostTags.filter((pt) => pt.postId === postId);
					},
				};
			};

			const findOrCreateTags = async (
				tagInputs: Array<
					{ name: string } | { id: string; name: string; slug: string }
				>,
				tagCache: ReturnType<typeof createTagCache>,
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

				const allTags = await tagCache.getAllTags();
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
					tagCache.addTag(newTag);
				}

				return [...tagsWithIds, ...foundTags, ...createdTags];
			};

			const loadTagsForPosts = async (
				postIds: string[],
				tagCache: ReturnType<typeof createTagCache>,
				postTagCache: ReturnType<typeof createPostTagCache>,
			): Promise<Map<string, Tag[]>> => {
				if (postIds.length === 0) return new Map();

				const allPostTags = await postTagCache.getAllPostTags();
				const relevantPostTags = allPostTags.filter((pt) =>
					postIds.includes(pt.postId),
				);

				const tagIds = [...new Set(relevantPostTags.map((pt) => pt.tagId))];
				if (tagIds.length === 0) return new Map();

				const allTags = await tagCache.getAllTags();
				const tagMap = new Map<string, Tag>();
				for (const tag of allTags) {
					tagMap.set(tag.id, tag);
				}

				const postTagsMap = new Map<string, Tag[]>();
				for (const postTag of relevantPostTags) {
					const tag = tagMap.get(postTag.tagId);
					if (tag) {
						const existing = postTagsMap.get(postTag.postId) || [];
						postTagsMap.set(postTag.postId, [...existing, { ...tag }]);
					}
				}

				return postTagsMap;
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
					const tagCache = createTagCache();
					const postTagCache = createPostTagCache();

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
							const allTags = await tagCache.getAllTags();
							const tag = allTags.find((t) => t.slug === query.tagSlug);

							if (!tag) {
								return [];
							}

							const postTags = await postTagCache.getByTagId(tag.id);
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

						const posts = await adapter.findMany<Post>({
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
						});

						const postTagsMap = await loadTagsForPosts(
							posts.map((post) => post.id),
							tagCache,
							postTagCache,
						);

						let result = posts.map((post) => ({
							...post,
							tags: postTagsMap.get(post.id) || [],
						}));

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
					const tagCache = createTagCache();

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
								slug: postData.slug ? postData.slug : slugify(postData.title),
								tags: [],
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						if (tagNames.length > 0) {
							const createdTags = await findOrCreateTags(tagNames, tagCache);

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
					const tagCache = createTagCache();

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

						const { tags, ...postData } = ctx.body;
						const tagNames = tags || [];

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
								const createdTags = await findOrCreateTags(tagNames, tagCache);

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

						await adapter.transaction(async (tx) => {
							await tx.delete({
								model: "postTag",
								where: [{ field: "postId", value: ctx.params.id }],
							});

							await tx.delete<Post>({
								model: "post",
								where: [{ field: "id", value: ctx.params.id }],
							});
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
					const tagCache = createTagCache();
					const postTagCache = createPostTagCache();

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
						const targetTime = new Date(date).getTime();

						// Window-based approach for finding next/previous posts
						// This avoids relying on comparison operators (lt/gt) which may not be
						// consistently implemented across all database adapters (e.g., Drizzle).
						//
						// Strategy:
						// 1. Fetch a window of recent published posts (sorted by date DESC)
						// 2. Filter in memory to find posts immediately before/after target date
						//
						// Trade-offs:
						// - Works reliably across all adapters (only uses eq operator and sorting)
						// - Efficient for typical blog sizes (100 most recent posts)
						// - Limitation: If target post is outside the window, we may not find neighbors
						//   (acceptable for typical blog navigation where users browse recent content)
						const WINDOW_SIZE = 100;

						const allPosts = await adapter.findMany<Post>({
							model: "post",
							limit: WINDOW_SIZE,
							where: [
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
						});

						// Sort posts by createdAt descending (newest first)
						const sortedPosts = allPosts.sort((a, b) => {
							const timeA = new Date(a.createdAt).getTime();
							const timeB = new Date(b.createdAt).getTime();
							return timeB - timeA;
						});

						// Find posts immediately before and after the target date
						// In DESC sorted array: newer posts come before, older posts come after
						let previousPost: Post | null = null;
						let nextPost: Post | null = null;

						for (let i = 0; i < sortedPosts.length; i++) {
							const post = sortedPosts[i];
							if (!post) continue;

							const postTime = new Date(post.createdAt).getTime();

							if (postTime > targetTime) {
								// This post is newer than target - it's a next post candidate
								// Keep the last one we find (closest to target date)
								nextPost = post;
							} else if (postTime < targetTime) {
								// This is the first post older than target - this is the previous post
								previousPost = post;
								// We've found both neighbors, no need to continue
								break;
							}
							// Skip posts with exactly the same timestamp (the current post itself)
						}

						const postIds = [
							...(previousPost ? [previousPost.id] : []),
							...(nextPost ? [nextPost.id] : []),
						];
						const postTagsMap = await loadTagsForPosts(
							postIds,
							tagCache,
							postTagCache,
						);

						return {
							previous: previousPost
								? {
										...previousPost,
										tags: postTagsMap.get(previousPost.id) || [],
									}
								: null,
							next: nextPost
								? {
										...nextPost,
										tags: postTagsMap.get(nextPost.id) || [],
									}
								: null,
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
