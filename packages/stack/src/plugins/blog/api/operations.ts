import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	type DeepReadonly,
	OperationHttpError,
	type OperationContext,
	type OperationErrorContext,
} from "@btst/stack/plugins/api";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import { z } from "zod";
import { blogPermissions } from "../permissions";
import { createPostSchema, updatePostSchema } from "../schemas";
import type { Post, PostWithPostTag, SerializedPost, Tag } from "../types";
import { slugify } from "../utils";
import { getAllPosts, getAllTags } from "./getters";
import {
	createPost as createPostMutation,
	deletePost as deletePostMutation,
	updatePost as updatePostMutation,
} from "./mutations";
import { serializePost, serializeTag } from "./serializers";

export const PostListQuerySchema = z.object({
	slug: z.string().optional(),
	tagSlug: z.string().optional(),
	offset: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	query: z.string().max(200).optional(),
	published: z
		.union([z.boolean(), z.enum(["true", "false"])])
		.optional()
		.transform((value) => {
			if (value === undefined) return undefined;
			return value === true || value === "true";
		}),
});

export const NextPreviousPostsQuerySchema = z.object({
	date: z.coerce.date().transform((date) => date.toISOString()),
});

const operationDateSchema = z.coerce
	.date()
	.transform((date) => date.toISOString())
	.optional();

export const CreatePostOperationInputSchema = createPostSchema.extend({
	publishedAt: operationDateSchema,
	createdAt: operationDateSchema,
	updatedAt: operationDateSchema,
});

export const UpdatePostOperationInputSchema = z.object({
	id: z.string(),
	data: updatePostSchema.omit({ id: true }).extend({
		publishedAt: operationDateSchema,
		createdAt: operationDateSchema,
		updatedAt: operationDateSchema,
	}),
});

const DeletePostInputSchema = z.object({ id: z.string() });
const EmptyInputSchema = z.object({});

type ReadFacts = PermissionFactsFor<typeof blogPermissions.post.read>;
type CreateFacts = PermissionFactsFor<typeof blogPermissions.post.create>;
type UpdateFacts = PermissionFactsFor<typeof blogPermissions.post.update>;
type DeleteFacts = PermissionFactsFor<typeof blogPermissions.post.delete>;

type ListPostsInput = z.output<typeof PostListQuerySchema>;
type CreatePostInput = z.output<typeof CreatePostOperationInputSchema>;
type UpdatePostInput = z.output<typeof UpdatePostOperationInputSchema>;
type DeletePostInput = z.output<typeof DeletePostInputSchema>;
type NextPreviousPostsInput = z.output<typeof NextPreviousPostsQuerySchema>;

export type SerializedPostListResult = ReturnType<typeof serializeListResult>;
export type SerializedNextPreviousPostsResult = Awaited<
	ReturnType<typeof findNextPreviousPosts>
>;

type RequestFields = {
	readonly request?: Request;
	readonly headers?: Headers;
};

type BlogOperationContext<TInput, TFacts> = OperationContext<TInput, TFacts> &
	RequestFields;
type BlogOperationErrorContext<TInput, TFacts> = OperationErrorContext<
	TInput,
	TFacts
> &
	RequestFields;

/** Authorized context supplied before a Blog post-list query executes. */
export interface BlogListOperationContext
	extends BlogOperationContext<ListPostsInput, ReadFacts> {
	readonly query: DeepReadonly<ListPostsInput>;
}

/** Blog post-list context after execution, including the readonly result. */
export interface BlogListResultContext extends BlogListOperationContext {
	readonly result: DeepReadonly<SerializedPostListResult>;
}

/** Blog post-list context supplied when authorized execution fails. */
export interface BlogListErrorContext
	extends BlogOperationErrorContext<ListPostsInput, ReadFacts> {
	readonly query: DeepReadonly<ListPostsInput>;
}

/** Authorized context supplied before a Blog post is created. */
export interface BlogCreateOperationContext
	extends BlogOperationContext<CreatePostInput, CreateFacts> {
	readonly body: DeepReadonly<CreatePostInput>;
}

/** Blog create context after execution, including the readonly post. */
export interface BlogCreateResultContext extends BlogCreateOperationContext {
	readonly result: DeepReadonly<SerializedPost>;
}

/** Blog create context supplied when authorized execution fails. */
export interface BlogCreateErrorContext
	extends BlogOperationErrorContext<CreatePostInput, CreateFacts> {
	readonly body: DeepReadonly<CreatePostInput>;
}

/** Authorized context supplied before a Blog post is updated. */
export interface BlogUpdateOperationContext
	extends BlogOperationContext<UpdatePostInput, UpdateFacts> {
	readonly params: { readonly id: string };
	readonly body: DeepReadonly<UpdatePostInput["data"]>;
}

/** Blog update context after execution, including the readonly post. */
export interface BlogUpdateResultContext extends BlogUpdateOperationContext {
	readonly result: DeepReadonly<SerializedPost>;
}

/** Blog update context supplied when authorized execution fails. */
export interface BlogUpdateErrorContext
	extends BlogOperationErrorContext<UpdatePostInput, UpdateFacts> {
	readonly params: { readonly id: string };
	readonly body: DeepReadonly<UpdatePostInput["data"]>;
}

/** Authorized context supplied before a Blog post is deleted. */
export interface BlogDeleteOperationContext
	extends BlogOperationContext<DeletePostInput, DeleteFacts> {
	readonly params: { readonly id: string };
}

/** Blog delete context after execution, including its success result. */
export interface BlogDeleteResultContext extends BlogDeleteOperationContext {
	readonly result: { readonly success: true };
}

/** Blog delete context supplied when authorized execution fails. */
export interface BlogDeleteErrorContext
	extends BlogOperationErrorContext<DeletePostInput, DeleteFacts> {
	readonly params: { readonly id: string };
}

/** Authorized context supplied before Blog navigation posts are queried. */
export interface BlogNextPreviousOperationContext
	extends BlogOperationContext<NextPreviousPostsInput, ReadFacts> {
	readonly query: DeepReadonly<NextPreviousPostsInput>;
}

/** Blog navigation context after execution, including adjacent posts. */
export interface BlogNextPreviousResultContext
	extends BlogNextPreviousOperationContext {
	readonly result: DeepReadonly<SerializedNextPreviousPostsResult>;
}

/** Blog navigation context supplied when authorized execution fails. */
export interface BlogNextPreviousErrorContext
	extends BlogOperationErrorContext<NextPreviousPostsInput, ReadFacts> {
	readonly query: DeepReadonly<NextPreviousPostsInput>;
}

/** Domain lifecycle hooks that run only after successful Blog authorization. */
export interface BlogBackendHooks {
	onBeforeListPosts?: (
		filter: DeepReadonly<ListPostsInput>,
		context: BlogListOperationContext,
	) => Promise<void> | void;
	onBeforeCreatePost?: (
		data: DeepReadonly<CreatePostInput>,
		context: BlogCreateOperationContext,
	) => Promise<void> | void;
	onBeforeUpdatePost?: (
		postId: string,
		data: DeepReadonly<UpdatePostInput["data"]>,
		context: BlogUpdateOperationContext,
	) => Promise<void> | void;
	onBeforeDeletePost?: (
		postId: string,
		context: BlogDeleteOperationContext,
	) => Promise<void> | void;
	onBeforeGetNextPreviousPosts?: (
		query: DeepReadonly<NextPreviousPostsInput>,
		context: BlogNextPreviousOperationContext,
	) => Promise<void> | void;
	onAfterListPosts?: (
		posts: readonly DeepReadonly<SerializedPost>[],
		filter: DeepReadonly<ListPostsInput>,
		context: BlogListResultContext,
	) => Promise<void> | void;
	onAfterCreatePost?: (
		post: DeepReadonly<SerializedPost>,
		context: BlogCreateResultContext,
	) => Promise<void> | void;
	onAfterUpdatePost?: (
		post: DeepReadonly<SerializedPost>,
		context: BlogUpdateResultContext,
	) => Promise<void> | void;
	onAfterDeletePost?: (
		postId: string,
		context: BlogDeleteResultContext,
	) => Promise<void> | void;
	onAfterGetNextPreviousPosts?: (
		result: DeepReadonly<SerializedNextPreviousPostsResult>,
		context: BlogNextPreviousResultContext,
	) => Promise<void> | void;
	onErrorListPosts?: (
		error: Error,
		context: BlogListErrorContext,
	) => Promise<void> | void;
	onErrorGetNextPreviousPosts?: (
		error: Error,
		context: BlogNextPreviousErrorContext,
	) => Promise<void> | void;
	onErrorCreatePost?: (
		error: Error,
		context: BlogCreateErrorContext,
	) => Promise<void> | void;
	onErrorUpdatePost?: (
		error: Error,
		context: BlogUpdateErrorContext,
	) => Promise<void> | void;
	onErrorDeletePost?: (
		error: Error,
		context: BlogDeleteErrorContext,
	) => Promise<void> | void;
}

/** A domain/HTTP error raised after authorization succeeds. */
export class BlogOperationError extends OperationHttpError {
	constructor(
		statusCode: number,
		message: string,
		code = "BLOG_OPERATION_ERROR",
	) {
		super(statusCode, message, code);
		this.name = "BlogOperationError";
	}
}

function normalizeOperationError(error: unknown, fallback: string): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : fallback, {
		cause: error,
	});
}

function requestFields(request: Request | undefined): RequestFields {
	return request ? { request, headers: request.headers } : {};
}

function listContext(
	context: OperationContext<ListPostsInput, ReadFacts>,
): BlogListOperationContext {
	return Object.freeze({
		...context,
		query: context.input,
		...requestFields(context.request),
	});
}

function createContext(
	context: OperationContext<CreatePostInput, CreateFacts>,
): BlogCreateOperationContext {
	return Object.freeze({
		...context,
		body: context.input,
		...requestFields(context.request),
	});
}

function updateContext(
	context: OperationContext<UpdatePostInput, UpdateFacts>,
): BlogUpdateOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		body: context.input.data,
		...requestFields(context.request),
	});
}

function deleteContext(
	context: OperationContext<DeletePostInput, DeleteFacts>,
): BlogDeleteOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		...requestFields(context.request),
	});
}

function nextPreviousContext(
	context: OperationContext<NextPreviousPostsInput, ReadFacts>,
): BlogNextPreviousOperationContext {
	return Object.freeze({
		...context,
		query: context.input,
		...requestFields(context.request),
	});
}

function transitionFor(
	currentPublished: boolean | undefined,
	requestedPublished: boolean | undefined,
): UpdateFacts["publish"] {
	if (
		requestedPublished === undefined ||
		requestedPublished === currentPublished
	) {
		return "unchanged";
	}
	return requestedPublished ? "publish" : "unpublish";
}

function expectedPublishedForUpdate(
	requestedPublished: boolean | undefined,
	transition: UpdateFacts["publish"],
): boolean | undefined {
	if (requestedPublished === undefined) return undefined;
	if (transition === "publish") return false;
	if (transition === "unpublish") return true;
	return requestedPublished;
}

async function readFactsForList(
	adapter: Adapter,
	input: DeepReadonly<ListPostsInput>,
): Promise<ReadFacts> {
	if (!input.slug) {
		return input.published === true
			? { scope: "published" }
			: { scope: "drafts" };
	}

	const post = await adapter.findOne<Post>({
		model: "post",
		where: [{ field: "slug", value: input.slug }],
	});
	return {
		scope: "post",
		slug: input.slug,
		exists: post != null,
		...(post?.id ? { id: post.id } : {}),
		...(post?.authorId ? { authorId: post.authorId } : {}),
		published: post?.published ?? false,
	};
}

function serializeOperationTag(tag: Tag) {
	return { ...serializeTag(tag) };
}

function serializeOperationPost(post: Post & { tags: Tag[] }) {
	const serialized = serializePost(post);
	return {
		...serialized,
		tags: serialized.tags.map((tag) => ({ ...tag })),
	};
}

function serializeListResult(result: Awaited<ReturnType<typeof getAllPosts>>) {
	return {
		items: result.items.map(serializeOperationPost),
		total: result.total,
		...(result.limit !== undefined ? { limit: result.limit } : {}),
		...(result.offset !== undefined ? { offset: result.offset } : {}),
	};
}

function assertDetailReadMatchesFacts(
	input: DeepReadonly<ListPostsInput>,
	facts: DeepReadonly<ReadFacts>,
	result: SerializedPostListResult,
) {
	if (!input.slug || facts.scope !== "post") return;
	const stateChanged = result.items.some(
		(post) =>
			!facts.exists ||
			post.id !== facts.id ||
			post.slug !== facts.slug ||
			(post.authorId ?? undefined) !== facts.authorId ||
			post.published !== facts.published,
	);
	if (stateChanged) {
		throw new BlogOperationError(
			409,
			"Post visibility changed while authorization was being evaluated. Retry the read.",
			"POST_READ_STATE_CHANGED",
		);
	}
}

async function findNextPreviousPosts(adapter: Adapter, date: Date) {
	const [previousPosts, nextPosts] = await Promise.all([
		adapter.findMany<PostWithPostTag>({
			model: "post",
			limit: 1,
			where: [
				{ field: "createdAt", value: date, operator: "lt" as const },
				{ field: "published", value: true, operator: "eq" as const },
			],
			sortBy: { field: "createdAt", direction: "desc" },
			join: { postTag: true },
		}),
		adapter.findMany<PostWithPostTag>({
			model: "post",
			limit: 1,
			where: [
				{ field: "createdAt", value: date, operator: "gt" as const },
				{ field: "published", value: true, operator: "eq" as const },
			],
			sortBy: { field: "createdAt", direction: "asc" },
			join: { postTag: true },
		}),
	]);

	const allPosts = [...previousPosts, ...nextPosts];
	const tagIds = new Set(
		allPosts.flatMap((post) =>
			(post.postTag ?? []).map((postTag) => postTag.tagId),
		),
	);
	const tags =
		tagIds.size === 0 ? [] : await adapter.findMany<Tag>({ model: "tag" });
	const tagMap = new Map(
		tags.filter((tag) => tagIds.has(tag.id)).map((tag) => [tag.id, tag]),
	);
	const serializeJoinedPost = (post: PostWithPostTag | undefined) => {
		if (!post) return null;
		const { postTag, ...postWithoutJoin } = post;
		return serializeOperationPost({
			...postWithoutJoin,
			tags: (postTag ?? [])
				.map((value) => tagMap.get(value.tagId))
				.filter((tag): tag is Tag => tag !== undefined),
		});
	};

	return {
		previous: serializeJoinedPost(previousPosts[0]),
		next: serializeJoinedPost(nextPosts[0]),
	};
}

export function createBlogOperations(
	adapter: Adapter,
	hooks?: BlogBackendHooks,
) {
	const listPosts = defineOperation({
		input: PostListQuerySchema,
		permission: blogPermissions.post.read,
		facts: ({ input }) => readFactsForList(adapter, input),
		before: async (context) => {
			await hooks?.onBeforeListPosts?.(context.input, listContext(context));
		},
		execute: async ({ input, facts }) => {
			const result = serializeListResult(await getAllPosts(adapter, input));
			assertDetailReadMatchesFacts(input, facts, result);
			return result;
		},
		after: async (context) => {
			const base = listContext(context);
			const lifecycleContext = Object.freeze({
				...base,
				result: context.result,
			}) satisfies BlogListResultContext;
			await hooks?.onAfterListPosts?.(
				context.result.items,
				context.input,
				lifecycleContext,
			);
		},
		onError: async (context) => {
			const base = listContext(context);
			await hooks?.onErrorListPosts?.(
				normalizeOperationError(context.error, "Blog list operation failed."),
				Object.freeze({ ...base, error: context.error }),
			);
		},
	});

	const createPost = defineOperation({
		input: CreatePostOperationInputSchema,
		permission: blogPermissions.post.create,
		facts: ({ input }) => ({
			publish: input.published ? ("published" as const) : ("draft" as const),
		}),
		before: async (context) => {
			await hooks?.onBeforeCreatePost?.(context.input, createContext(context));
		},
		execute: async ({ input, identity }) => {
			const {
				tags,
				slug: rawSlug,
				createdAt: _createdAt,
				updatedAt: _updatedAt,
				publishedAt,
				...postData
			} = input;
			const slug = slugify(rawSlug || postData.title);
			if (!slug) {
				throw new BlogOperationError(
					400,
					"Invalid slug: must contain at least one alphanumeric character",
					"INVALID_SLUG",
				);
			}
			const post = await createPostMutation(adapter, {
				...postData,
				...(identity ? { authorId: identity.id } : {}),
				slug,
				tags: [...(tags ?? [])],
				...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			return serializeOperationPost(post);
		},
		after: async (context) => {
			const base = createContext(context);
			await hooks?.onAfterCreatePost?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async (context) => {
			const base = createContext(context);
			await hooks?.onErrorCreatePost?.(
				normalizeOperationError(context.error, "Blog create operation failed."),
				Object.freeze({ ...base, error: context.error }),
			);
		},
	});

	const updatePost = defineOperation({
		input: UpdatePostOperationInputSchema,
		permission: blogPermissions.post.update,
		facts: async ({ input }) => {
			const post = await adapter.findOne<Post>({
				model: "post",
				where: [{ field: "id", value: input.id }],
			});
			return {
				id: input.id,
				...(post?.authorId ? { authorId: post.authorId } : {}),
				publish: transitionFor(post?.published, input.data.published),
			};
		},
		before: async (context) => {
			await hooks?.onBeforeUpdatePost?.(
				context.input.id,
				context.input.data,
				updateContext(context),
			);
		},
		execute: async ({ input, facts }) => {
			const {
				tags,
				slug: rawSlug,
				createdAt: _createdAt,
				updatedAt: _updatedAt,
				publishedAt,
				...postData
			} = input.data;
			const slug = rawSlug ? slugify(rawSlug) : undefined;
			if (rawSlug && !slug) {
				throw new BlogOperationError(
					400,
					"Invalid slug: must contain at least one alphanumeric character",
					"INVALID_SLUG",
				);
			}
			const expectedPublished = expectedPublishedForUpdate(
				input.data.published,
				facts.publish,
			);
			const updated = await updatePostMutation(
				adapter,
				input.id,
				{
					...postData,
					...(slug ? { slug } : {}),
					tags: [...(tags ?? [])],
					...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
				},
				{ expectedPublished },
			);
			if (!updated) {
				if (
					expectedPublished !== undefined &&
					(await adapter.findOne<Post>({
						model: "post",
						where: [{ field: "id", value: input.id }],
					}))
				) {
					throw new BlogOperationError(
						409,
						"Post changed while authorization was being evaluated. Retry the update.",
						"POST_STATE_CHANGED",
					);
				}
				throw new BlogOperationError(404, "Post not found", "POST_NOT_FOUND");
			}
			return serializeOperationPost(updated);
		},
		after: async (context) => {
			const base = updateContext(context);
			await hooks?.onAfterUpdatePost?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async (context) => {
			const base = updateContext(context);
			await hooks?.onErrorUpdatePost?.(
				normalizeOperationError(context.error, "Blog update operation failed."),
				Object.freeze({ ...base, error: context.error }),
			);
		},
	});

	const deletePost = defineOperation({
		input: DeletePostInputSchema,
		permission: blogPermissions.post.delete,
		facts: async ({ input }) => {
			const post = await adapter.findOne<Post>({
				model: "post",
				where: [{ field: "id", value: input.id }],
			});
			return {
				id: input.id,
				...(post?.authorId ? { authorId: post.authorId } : {}),
			};
		},
		before: async (context) => {
			await hooks?.onBeforeDeletePost?.(
				context.input.id,
				deleteContext(context),
			);
		},
		execute: async ({ input }) => {
			await deletePostMutation(adapter, input.id);
			return { success: true } as const;
		},
		after: async (context) => {
			const base = deleteContext(context);
			await hooks?.onAfterDeletePost?.(
				context.input.id,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async (context) => {
			const base = deleteContext(context);
			await hooks?.onErrorDeletePost?.(
				normalizeOperationError(context.error, "Blog delete operation failed."),
				Object.freeze({ ...base, error: context.error }),
			);
		},
	});

	const getNextPreviousPosts = defineOperation({
		input: NextPreviousPostsQuerySchema,
		permission: blogPermissions.post.read,
		facts: () => ({ scope: "published" as const }),
		before: async (context) => {
			await hooks?.onBeforeGetNextPreviousPosts?.(
				context.input,
				nextPreviousContext(context),
			);
		},
		execute: ({ input }) =>
			findNextPreviousPosts(adapter, new Date(input.date)),
		after: async (context) => {
			const base = nextPreviousContext(context);
			await hooks?.onAfterGetNextPreviousPosts?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async (context) => {
			const base = nextPreviousContext(context);
			await hooks?.onErrorGetNextPreviousPosts?.(
				normalizeOperationError(
					context.error,
					"Blog navigation operation failed.",
				),
				Object.freeze({ ...base, error: context.error }),
			);
		},
	});

	const listTags = defineOperation({
		input: EmptyInputSchema,
		permission: blogPermissions.tag.read,
		facts: () => undefined,
		execute: async () => (await getAllTags(adapter)).map(serializeOperationTag),
	});

	return {
		listPosts,
		createPost,
		updatePost,
		deletePost,
		getNextPreviousPosts,
		listTags,
	} as const;
}
