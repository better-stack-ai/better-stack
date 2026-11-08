import type { DBAdapter as Adapter } from "@btst/db";
import { PostRevisionTagsSchema } from "../schemas";
import type { Post, PostWithPostTag, Tag, PostRevision } from "../types";

/**
 * Parameters for filtering/paginating posts.
 * Mirrors the shape of the list API query schema.
 */
export interface PostListParams {
	slug?: string;
	tagSlug?: string;
	offset?: number;
	limit?: number;
	query?: string;
	published?: boolean;
}

/**
 * Paginated result returned by {@link getAllPosts}.
 */
export interface PostListResult {
	items: Array<Post & { tags: Tag[] }>;
	total: number;
	limit?: number;
	offset?: number;
}

/**
 * Retrieve all posts matching optional filter criteria.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters (same shape as the list API query)
 */
async function getStoredPosts(
	adapter: Adapter,
	params?: PostListParams,
): Promise<PostListResult> {
	const query = params ?? {};

	const whereConditions: Array<{
		field: string;
		value: string | number | boolean | string[] | number[] | Date | null;
		operator: "eq" | "in";
	}> = [];

	// Resolve tagSlug → post IDs up front, then push an `in` condition so the
	// adapter can filter and paginate entirely at the DB level.  The previous
	// approach loaded every post into memory and filtered with a JS Set, which
	// scans the whole table on every request.
	if (query.tagSlug) {
		const tag = await adapter.findOne<Tag>({
			model: "tag",
			where: [{ field: "slug", value: query.tagSlug, operator: "eq" as const }],
		});

		if (!tag) {
			return { items: [], total: 0, limit: query.limit, offset: query.offset };
		}

		const postTags = await adapter.findMany<{ postId: string; tagId: string }>({
			model: "postTag",
			where: [{ field: "tagId", value: tag.id, operator: "eq" as const }],
		});

		const taggedPostIds = postTags.map((pt) => pt.postId);
		if (taggedPostIds.length === 0) {
			return { items: [], total: 0, limit: query.limit, offset: query.offset };
		}

		whereConditions.push({
			field: "id",
			value: taggedPostIds,
			operator: "in" as const,
		});
	}

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

	// Separate ID queries express (title OR content OR excerpt) AND the existing
	// filters without depending on adapter-specific OR grouping semantics.
	const search = query.query;
	if (search) {
		const textFields = ["title", "content", "excerpt"] as const;
		// SQL LIKE wildcards and database Unicode collations do not reproduce
		// JavaScript's literal, lowercase substring matching on every adapter.
		const literal = /[%_\\]|[^\x00-\x7f]/.test(search);
		const matches = await Promise.all(
			(literal ? [null] : textFields).map(async (field) => {
				const ids: { id: string }[] = [];
				for (let offset = 0; ; offset += 1000) {
					const page = await adapter.findMany<
						Pick<Post, "id" | "title" | "content" | "excerpt">
					>({
						model: "post",
						select: field ? ["id"] : ["id", ...textFields],
						limit: 1000,
						offset,
						sortBy: { field: "id", direction: "asc" },
						where: [
							...whereConditions,
							...(field
								? [
										{
											field,
											value: search,
											operator: "contains" as const,
											mode: "insensitive" as const,
										},
									]
								: []),
						],
					});
					ids.push(
						...(field
							? page
							: page.filter((post) =>
									textFields.some((name) =>
										post[name].toLowerCase().includes(search.toLowerCase()),
									),
								)),
					);
					if (page.length < 1000) return ids;
				}
			}),
		);
		const ids = [...new Set(matches.flat().map((post) => post.id))];
		if (!ids.length)
			return { items: [], total: 0, limit: query.limit, offset: query.offset };
		whereConditions.push({ field: "id", value: ids, operator: "in" });
	}
	const dbWhere = whereConditions.length > 0 ? whereConditions : undefined;
	const dbTotal = await adapter.count({ model: "post", where: dbWhere });

	const posts = await adapter.findMany<PostWithPostTag>({
		model: "post",
		limit: query.limit,
		offset: query.offset,
		where: dbWhere,
		sortBy: { field: "createdAt", direction: "desc" },
		join: { postTag: true },
	});

	// Collect the unique tag IDs present in this page of posts, then fetch
	// only those tags (not the entire tags table).
	const tagIds = new Set<string>();
	for (const post of posts) {
		if (post.postTag) {
			for (const pt of post.postTag) {
				tagIds.add(pt.tagId);
			}
		}
	}

	const tags =
		tagIds.size > 0
			? await adapter.findMany<Tag>({
					model: "tag",
					where: [
						{
							field: "id",
							value: Array.from(tagIds),
							operator: "in" as const,
						},
					],
				})
			: [];
	const tagMap = new Map<string, Tag>(tags.map((t) => [t.id, t]));

	const result = posts.map((post) => {
		const postTags = (post.postTag || [])
			.map((pt) => {
				const tag = tagMap.get(pt.tagId);
				return tag ? { ...tag } : undefined;
			})
			.filter((tag): tag is Tag => tag !== undefined);
		const { postTag: _, ...postWithoutJoin } = post;
		return { ...postWithoutJoin, tags: postTags };
	});

	return {
		items: result,
		total: dbTotal ?? result.length,
		limit: query.limit,
		offset: query.offset,
	};
}

/**
 * Retrieve a single post by its slug, including associated tags.
 * Returns null if no post is found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param slug - The post slug
 */
export async function getWorkingPostBySlug(
	adapter: Adapter,
	slug: string,
): Promise<(Post & { tags: Tag[] }) | null> {
	const posts = await adapter.findMany<PostWithPostTag>({
		model: "post",
		where: [{ field: "slug", value: slug, operator: "eq" as const }],
		limit: 1,
		join: { postTag: true },
	});

	if (posts.length === 0) return null;

	const post = posts[0]!;
	const tagIds = (post.postTag || []).map((pt) => pt.tagId);

	const tags =
		tagIds.length > 0
			? await adapter.findMany<Tag>({
					model: "tag",
					where: [{ field: "id", value: tagIds, operator: "in" as const }],
				})
			: [];

	const tagMap = new Map<string, Tag>(tags.map((t) => [t.id, t]));
	const resolvedTags = (post.postTag || [])
		.map((pt) => tagMap.get(pt.tagId))
		.filter((t): t is Tag => t !== undefined);

	const { postTag: _, ...postWithoutJoin } = post;
	return { ...postWithoutJoin, tags: resolvedTags };
}

/**
 * Retrieve all tags, sorted alphabetically by name.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 */
export async function getAllTags(adapter: Adapter): Promise<Tag[]> {
	if (!(await hasEditorialActivation(adapter))) {
		const tags = await adapter.findMany<Tag>({
			model: "tag",
			sortBy: { field: "name", direction: "asc" },
		});
		if (!(await hasEditorialActivation(adapter))) return tags;
	}
	const posts = await getAllPosts(adapter, { published: true });
	return [
		...new Map(
			posts.items.flatMap((post) => post.tags).map((tag) => [tag.id, tag]),
		).values(),
	].sort((a, b) => a.name.localeCompare(b.name));
}

export type StoredPostRevision = Omit<PostRevision, "tags"> & {
	tags: string;
	revisionKey: string;
};

/** Private history. Callers own authorization; public post readers never join this table. */
export async function listPostRevisions(
	adapter: Adapter,
	id: string,
	offset = 0,
	limit = 20,
) {
	const where = [{ field: "postId", value: id }];
	const revisions = await adapter.findMany<StoredPostRevision>({
		model: "postRevision",
		where,
		offset,
		limit,
		sortBy: { field: "version", direction: "desc" },
	});
	return {
		items: revisions.map(
			({ revisionKey: _, tags, createdAt, publishedAt, ...revision }) => ({
				...revision,
				tags: PostRevisionTagsSchema.parse(JSON.parse(tags)),
				createdAt: createdAt.toISOString(),
				publishedAt: publishedAt?.toISOString(),
			}),
		),
		total: await adapter.count({ model: "postRevision", where }),
		offset,
		limit,
	};
}

/** Append-only activation makes the public-read guard stable even after the last post is deleted. */
export async function hasEditorialActivation(adapter: Adapter) {
	return (await adapter.count({ model: "editorialActivation" })) > 0;
}

/** Resolve the public snapshot before any filters, totals, or pagination. */
export async function getAllPosts(
	adapter: Adapter,
	params?: PostListParams,
): Promise<PostListResult> {
	if (params?.published === false) return getStoredPosts(adapter, params);
	if (!(await hasEditorialActivation(adapter))) {
		const result = await getStoredPosts(adapter, params);
		if (!(await hasEditorialActivation(adapter))) return result;
	}
	const stored = await getStoredPosts(adapter);
	const projected = await Promise.all(
		stored.items.map(async (post): Promise<Post | null> => {
			if (!post.editorialEnabled) return post;
			if (!post.published || !post.editorialLiveRevisionId) return null;
			const revision = await adapter.findOne<StoredPostRevision>({
				model: "postRevision",
				where: [
					{ field: "id", value: post.editorialLiveRevisionId },
					{ field: "postId", value: post.id },
				],
			});
			if (!revision) return null;
			return {
				...post,
				title: revision.title,
				content: revision.content,
				excerpt: revision.excerpt,
				slug: revision.slug,
				image: revision.image,
				updatedAt: revision.createdAt,
				revisionVersion: revision.version,
				tags: PostRevisionTagsSchema.parse(JSON.parse(revision.tags)).map(
					(tag) => ({
						...tag,
						createdAt: revision.createdAt,
						updatedAt: revision.createdAt,
					}),
				),
			};
		}),
	);
	let items = projected.filter((post): post is Post => post !== null);
	if (params?.published !== undefined)
		items = items.filter((post) => post.published === params.published);
	if (params?.slug) items = items.filter((post) => post.slug === params.slug);
	if (params?.tagSlug)
		items = items.filter((post) =>
			post.tags.some((tag) => tag.slug === params.tagSlug),
		);
	if (params?.query) {
		const query = params.query.toLowerCase();
		items = items.filter((post) =>
			[post.title, post.content, post.excerpt].some((value) =>
				value.toLowerCase().includes(query),
			),
		);
	}
	const total = items.length;
	const offset = params?.offset ?? 0;
	return {
		items: items.slice(
			offset,
			params?.limit === undefined ? undefined : offset + params.limit,
		),
		total,
		offset: params?.offset,
		limit: params?.limit,
	};
}

/** Public Blog detail; editorial working copies require the authorized editor operation. */
export async function getPostBySlug(
	adapter: Adapter,
	slug: string,
): Promise<Post | null> {
	return (await getAllPosts(adapter, { slug, limit: 1 })).items[0] ?? null;
}
