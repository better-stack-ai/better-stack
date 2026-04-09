import type { DBAdapter as Adapter } from "@btst/db";
import type { Post, Tag } from "../types";
import { slugify } from "../utils";

type TagInput = { name: string } | { id: string; name: string; slug: string };

/**
 * Find existing tags by slug or create missing ones, then return the resolved Tag records.
 * Tags that already carry an `id` are returned as-is (after name normalisation).
 */
async function findOrCreateTags(
	adapter: Adapter,
	tagInputs: TagInput[],
): Promise<Tag[]> {
	if (tagInputs.length === 0) return [];

	const normalizeTagName = (name: string): string => name.trim();

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

	const allTags = await adapter.findMany<Tag>({ model: "tag" });
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
}

/**
 * Input for creating a new blog post.
 * `slug` must already be slugified by the caller.
 */
export interface CreatePostInput {
	title: string;
	content: string;
	excerpt: string;
	/** Pre-slugified URL slug — use {@link slugify} before passing. */
	slug: string;
	image?: string;
	published?: boolean;
	publishedAt?: Date;
	createdAt?: Date;
	updatedAt?: Date;
	tags?: TagInput[];
}

/**
 * Input for updating an existing blog post.
 * If `slug` is provided it must already be slugified by the caller.
 */
export interface UpdatePostInput {
	title?: string;
	content?: string;
	excerpt?: string;
	/** Pre-slugified URL slug — use {@link slugify} before passing. */
	slug?: string;
	image?: string;
	published?: boolean;
	publishedAt?: Date;
	createdAt?: Date;
	updatedAt?: Date;
	tags?: TagInput[];
}

/**
 * Create a new blog post with optional tag associations.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side and SSG use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeCreatePost`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param input - Post data; `slug` must be pre-slugified
 */
export async function createPost(
	adapter: Adapter,
	input: CreatePostInput,
): Promise<Post> {
	const { tags: tagInputs, ...postData } = input;
	const tagList = tagInputs ?? [];

	const newPost = await adapter.create<Post>({
		model: "post",
		data: {
			...postData,
			published: postData.published ?? false,
			tags: [] as Tag[],
			createdAt: postData.createdAt ?? new Date(),
			updatedAt: postData.updatedAt ?? new Date(),
		},
	});

	if (tagList.length > 0) {
		const resolvedTags = await findOrCreateTags(adapter, tagList);

		await adapter.transaction(async (tx) => {
			for (const tag of resolvedTags) {
				await tx.create<{ postId: string; tagId: string }>({
					model: "postTag",
					data: {
						postId: newPost.id,
						tagId: tag.id,
					},
				});
			}
		});

		newPost.tags = resolvedTags.map((tag) => ({ ...tag }));
	} else {
		newPost.tags = [];
	}

	return newPost;
}

/**
 * Update an existing blog post and reconcile its tag associations.
 * Returns `null` if no post with the given `id` exists.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeUpdatePost`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The post ID to update
 * @param input - Partial post data to apply; `slug` must be pre-slugified if provided
 */
export async function updatePost(
	adapter: Adapter,
	id: string,
	input: UpdatePostInput,
): Promise<Post | null> {
	const { tags: tagInputs, ...postData } = input;
	const tagList = tagInputs ?? [];

	return adapter.transaction(async (tx) => {
		const existingPostTags = await tx.findMany<{
			postId: string;
			tagId: string;
		}>({
			model: "postTag",
			where: [{ field: "postId", value: id, operator: "eq" as const }],
		});

		const updatedPost = await tx.update<Post>({
			model: "post",
			where: [{ field: "id", value: id }],
			update: {
				...postData,
				updatedAt: new Date(),
			},
		});

		if (!updatedPost) return null;

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

		if (tagList.length > 0) {
			const resolvedTags = await findOrCreateTags(adapter, tagList);

			for (const tag of resolvedTags) {
				await tx.create<{ postId: string; tagId: string }>({
					model: "postTag",
					data: {
						postId: id,
						tagId: tag.id,
					},
				});
			}

			updatedPost.tags = resolvedTags.map((tag) => ({ ...tag }));
		} else {
			updatedPost.tags = [];
		}

		return updatedPost;
	});
}

/**
 * Delete a blog post by ID.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeDeletePost`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The post ID to delete
 */
export async function deletePost(adapter: Adapter, id: string): Promise<void> {
	await adapter.delete<Post>({
		model: "post",
		where: [{ field: "id", value: id }],
	});
}
