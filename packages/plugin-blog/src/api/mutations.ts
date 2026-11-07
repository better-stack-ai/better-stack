import type { DBAdapter as Adapter } from "@btst/db";
import type { Post, Tag } from "../types";
import { slugify } from "../utils";

type TagInput = { name: string } | { id: string; name: string; slug: string };

type DataAdapter = Omit<Adapter, "transaction">;

// The memory adapter merges concurrent transaction snapshots without detecting
// conflicts. Serialize writes sharing an adapter; durable adapters also enforce
// the version predicate and unique revision key across processes.
const writeQueues = new WeakMap<Adapter, Promise<unknown>>();
function writeTransaction<T>(
	adapter: Adapter,
	run: (tx: DataAdapter) => Promise<T>,
): Promise<T> {
	const previous = writeQueues.get(adapter) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(() => adapter.transaction(run));
	writeQueues.set(adapter, next);
	return next;
}

async function findOrCreateTags(
	adapter: DataAdapter,
	inputs: TagInput[],
): Promise<Tag[]> {
	const result: Tag[] = [];
	for (const input of inputs) {
		const tag =
			"id" in input
				? await adapter.findOne<Tag>({
						model: "tag",
						where: [{ field: "id", value: input.id }],
					})
				: await adapter.findOne<Tag>({
						model: "tag",
						where: [{ field: "slug", value: slugify(input.name.trim()) }],
					});
		if ("id" in input && !tag)
			throw new Error("Referenced tag no longer exists");
		const resolved =
			tag ??
			(await adapter.create<Tag>({
				model: "tag",
				data: {
					name: input.name.trim(),
					slug: slugify(input.name.trim()),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}));
		if (!result.some((value) => value.id === resolved.id))
			result.push(resolved);
	}
	return result;
}

async function postTags(adapter: DataAdapter, id: string): Promise<Tag[]> {
	const links = await adapter.findMany<{ tagId: string }>({
		model: "postTag",
		where: [{ field: "postId", value: id }],
	});
	return links.length
		? adapter.findMany<Tag>({
				model: "tag",
				where: [
					{
						field: "id",
						value: links.map((link) => link.tagId),
						operator: "in",
					},
				],
			})
		: [];
}

async function replaceTags(adapter: DataAdapter, id: string, tags: Tag[]) {
	await adapter.deleteMany({
		model: "postTag",
		where: [{ field: "postId", value: id }],
	});
	for (const tag of tags)
		await adapter.create({
			model: "postTag",
			data: { postId: id, tagId: tag.id },
		});
}

async function assertSlugAvailable(
	adapter: DataAdapter,
	slug: string,
	id?: string,
) {
	const existing = await adapter.findOne<Post>({
		model: "post",
		where: [{ field: "slug", value: slug }],
	});
	if (existing && existing.id !== id)
		throw new Error("Post slug already exists");
}

async function appendRevision(
	adapter: DataAdapter,
	post: Post,
	version: number,
	actorId?: string,
) {
	await adapter.create({
		model: "postRevision",
		data: {
			postId: post.id,
			revisionKey: `${post.id}:${version}`,
			version,
			title: post.title,
			content: post.content,
			excerpt: post.excerpt,
			slug: post.slug,
			image: post.image,
			published: post.published,
			publishedAt: post.publishedAt,
			tags: JSON.stringify(
				post.tags.map(({ id, name, slug }) => ({ id, name, slug })),
			),
			actorId,
			createdAt: new Date(),
		},
	});
}

/**
 * Input for creating a new blog post.
 * `slug` must already be slugified by the caller.
 */
export interface CreatePostInput {
	/** Trusted author identity assigned by the authorized operation. */
	authorId?: string;
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

/** Optional atomic preconditions for a post update. */
export interface UpdatePostOptions {
	expectedVersion?: number;
	actorId?: string;
	/** Update only when the stored publish state still matches this value. */
	expectedPublished?: boolean;
}

/**
 * Create a new blog post with optional tag associations.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side and SSG use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT
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
	return writeTransaction(adapter, async (tx) => {
		const { tags: tagInputs, ...data } = input;
		await assertSlugAvailable(tx, data.slug);
		const post = await tx.create<Post>({
			model: "post",
			data: {
				...data,
				published: data.published ?? false,
				revisionVersion: 1,
				tags: [] as Tag[],
				createdAt: data.createdAt ?? new Date(),
				updatedAt: data.updatedAt ?? new Date(),
			},
		});
		post.tags = await findOrCreateTags(tx, tagInputs ?? []);
		await replaceTags(tx, post.id, post.tags);
		await appendRevision(tx, post, 1, input.authorId);
		return post;
	});
}

/**
 * Update an existing blog post and reconcile its tag associations.
 * Returns `null` if no post with the given `id` exists or an optional state
 * precondition no longer matches.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The post ID to update
 * @param input - Partial post data to apply; `slug` must be pre-slugified if provided
 * @param options - Optional state that must still match when the write executes
 */
export async function updatePost(
	adapter: Adapter,
	id: string,
	input: UpdatePostInput,
	options?: UpdatePostOptions,
): Promise<Post | null> {
	return writeTransaction(adapter, async (tx) => {
		const current = await tx.findOne<Post>({
			model: "post",
			where: [{ field: "id", value: id }],
		});
		if (!current) return null;
		const version = current.revisionVersion ?? 0;
		if (
			options?.expectedVersion !== undefined &&
			options.expectedVersion !== version
		)
			return null;
		const { tags: tagInputs, ...data } = input;
		if (data.slug !== undefined) await assertSlugAvailable(tx, data.slug, id);
		const updated = await tx.update<Post>({
			model: "post",
			where: [
				{ field: "id", value: id },
				{ field: "revisionVersion", value: version },
				...(options?.expectedPublished === undefined
					? []
					: [{ field: "published", value: options.expectedPublished }]),
			],
			update: {
				...data,
				revisionVersion: version === 0 ? 2 : version + 1,
				updatedAt: new Date(),
			},
		});
		if (!updated) return null;
		current.tags = await postTags(tx, id);
		if (version === 0) await appendRevision(tx, current, 1);
		updated.tags =
			tagInputs === undefined
				? current.tags
				: await findOrCreateTags(tx, tagInputs);
		if (tagInputs !== undefined) await replaceTags(tx, id, updated.tags);
		await appendRevision(
			tx,
			updated,
			updated.revisionVersion!,
			options?.actorId,
		);
		return updated;
	});
}

/**
 * Delete a blog post by ID.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The post ID to delete
 */
export async function deletePost(adapter: Adapter, id: string): Promise<void> {
	await writeTransaction(adapter, async (tx) => {
		await tx.deleteMany({
			model: "postRevision",
			where: [{ field: "postId", value: id }],
		});
		await tx.deleteMany({
			model: "postTag",
			where: [{ field: "postId", value: id }],
		});
		await tx.delete<Post>({
			model: "post",
			where: [{ field: "id", value: id }],
		});
	});
}
