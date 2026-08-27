import type { DBAdapter as Adapter } from "@btst/db";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import {
	defineOperation,
	type DeepReadonly,
	type OperationContext,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { commentsPermissions } from "../permissions";
import {
	CommentCountQuerySchema,
	CommentListQuerySchema,
	createCommentSchema,
	updateCommentSchema,
	updateCommentStatusSchema,
} from "../schemas";
import type { Comment, CommentListResult, SerializedComment } from "../types";
import { getCommentById, getCommentCount, listComments } from "./getters";
import {
	createComment as createCommentMutation,
	deleteComment as deleteCommentMutation,
	toggleCommentLike as toggleCommentLikeMutation,
	updateComment as updateCommentMutation,
	updateCommentStatus as updateCommentStatusMutation,
} from "./mutations";

export const CreateCommentOperationInputSchema = createCommentSchema.extend({
	/** Trusted internal callers may set authorship; request identity always wins. */
	authorId: z.string().min(1).optional(),
});

export const UpdateCommentOperationInputSchema = z.object({
	id: z.string().min(1),
	data: updateCommentSchema,
});

export const ToggleCommentLikeOperationInputSchema = z.object({
	id: z.string().min(1),
	/** @deprecated Request identity is authoritative; retained for trusted internal/RC callers. */
	authorId: z.string().min(1).optional(),
});

export const UpdateCommentStatusOperationInputSchema = z.object({
	id: z.string().min(1),
	data: updateCommentStatusSchema,
});

export const DeleteCommentOperationInputSchema = z.object({
	id: z.string().min(1),
});

type ReadFacts = PermissionFactsFor<typeof commentsPermissions.thread.read>;
type CreateFacts = PermissionFactsFor<
	typeof commentsPermissions.thread.createComment
>;
type EditFacts = PermissionFactsFor<typeof commentsPermissions.comment.edit>;
type DeleteFacts = PermissionFactsFor<
	typeof commentsPermissions.comment.delete
>;
type ReactFacts = PermissionFactsFor<typeof commentsPermissions.comment.react>;
type ModerateFacts = PermissionFactsFor<
	typeof commentsPermissions.comment.moderate
>;

type ListInput = z.output<typeof CommentListQuerySchema>;
type CountInput = z.output<typeof CommentCountQuerySchema>;
type CreateInput = z.output<typeof CreateCommentOperationInputSchema>;
type UpdateInput = z.output<typeof UpdateCommentOperationInputSchema>;
type ToggleLikeInput = z.output<typeof ToggleCommentLikeOperationInputSchema>;
type UpdateStatusInput = z.output<
	typeof UpdateCommentStatusOperationInputSchema
>;
type DeleteInput = z.output<typeof DeleteCommentOperationInputSchema>;

type RequestFields = {
	readonly request?: Request;
	readonly headers?: Headers;
};

/** @deprecated Use the operation-specific Comments lifecycle contexts. */
export interface CommentsApiContext extends RequestFields {
	readonly body?: unknown;
	readonly params?: unknown;
	readonly query?: unknown;
	readonly [key: string]: unknown;
}

/** Authorized context supplied before a Comments list query executes. */
export interface CommentsListOperationContext
	extends OperationContext<ListInput, ReadFacts>,
		RequestFields {
	readonly query: DeepReadonly<ListInput>;
}

/** Authorized context supplied before a Comments count query executes. */
export interface CommentsCountOperationContext
	extends OperationContext<CountInput, ReadFacts>,
		RequestFields {
	readonly query: DeepReadonly<CountInput>;
}

/** Authorized context supplied before a comment is created. */
export interface CommentsCreateOperationContext
	extends OperationContext<CreateInput, CreateFacts>,
		RequestFields {
	readonly body: DeepReadonly<CreateInput>;
}

/** Comment-create context after execution. */
export interface CommentsCreateResultContext
	extends CommentsCreateOperationContext {
	readonly result: DeepReadonly<SerializedComment>;
}

/** Authorized context supplied before a comment is edited. */
export interface CommentsEditOperationContext
	extends OperationContext<UpdateInput, EditFacts>,
		RequestFields {
	readonly params: { readonly id: string };
	readonly body: DeepReadonly<UpdateInput["data"]>;
}

/** Comment-edit context after execution. */
export interface CommentsEditResultContext
	extends CommentsEditOperationContext {
	readonly result: DeepReadonly<SerializedComment>;
}

/** Authorized context supplied before a reaction is toggled. */
export interface CommentsReactOperationContext
	extends OperationContext<ToggleLikeInput, ReactFacts>,
		RequestFields {
	readonly params: { readonly id: string };
}

/** Authorized context supplied before a comment is moderated. */
export interface CommentsModerateOperationContext
	extends OperationContext<UpdateStatusInput, ModerateFacts>,
		RequestFields {
	readonly params: { readonly id: string };
	readonly body: DeepReadonly<UpdateStatusInput["data"]>;
}

/** Comment-moderation context after execution. */
export interface CommentsModerateResultContext
	extends CommentsModerateOperationContext {
	readonly result: DeepReadonly<SerializedComment>;
}

/** Authorized context supplied before a comment is deleted. */
export interface CommentsDeleteOperationContext
	extends OperationContext<DeleteInput, DeleteFacts>,
		RequestFields {
	readonly params: { readonly id: string };
}

/** Comment-delete context after execution. */
export interface CommentsDeleteResultContext
	extends CommentsDeleteOperationContext {
	readonly result: { readonly success: true };
}

/** Domain lifecycle hooks that run only after successful Comments authorization. */
export interface CommentsBackendHooks {
	onBeforeList?: (
		query: DeepReadonly<ListInput>,
		context: CommentsListOperationContext,
	) => Promise<void> | void;
	onBeforeCount?: (
		query: DeepReadonly<CountInput>,
		context: CommentsCountOperationContext,
	) => Promise<void> | void;
	onBeforeListByAuthor?: (
		authorId: string,
		query: DeepReadonly<ListInput>,
		context: CommentsListOperationContext,
	) => Promise<void> | void;
	onBeforePost?: (
		input: DeepReadonly<z.output<typeof createCommentSchema>>,
		context: CommentsCreateOperationContext,
	) => Promise<{ authorId: string } | void> | { authorId: string } | void;
	onAfterPost?: (
		comment: DeepReadonly<SerializedComment>,
		context: CommentsCreateResultContext,
	) => Promise<void> | void;
	onBeforeEdit?: (
		commentId: string,
		update: DeepReadonly<UpdateInput["data"]>,
		context: CommentsEditOperationContext,
	) => Promise<void> | void;
	onAfterEdit?: (
		comment: DeepReadonly<SerializedComment>,
		context: CommentsEditResultContext,
	) => Promise<void> | void;
	onBeforeLike?: (
		commentId: string,
		authorId: string,
		context: CommentsReactOperationContext,
	) => Promise<void> | void;
	onBeforeStatusChange?: (
		commentId: string,
		status: "pending" | "approved" | "spam",
		context: CommentsModerateOperationContext,
	) => Promise<void> | void;
	onAfterApprove?: (
		comment: DeepReadonly<SerializedComment>,
		context: CommentsModerateResultContext,
	) => Promise<void> | void;
	onBeforeDelete?: (
		commentId: string,
		context: CommentsDeleteOperationContext,
	) => Promise<void> | void;
	onAfterDelete?: (
		commentId: string,
		context: CommentsDeleteResultContext,
	) => Promise<void> | void;
}

/** Configuration and lifecycle options for the Comments backend plugin. */
export interface CommentsBackendOptions extends CommentsBackendHooks {
	/** Automatically approve newly created comments. @default false */
	autoApprove?: boolean;
	/** Register the create-comment HTTP endpoint. @default true */
	allowPosting?: boolean;
	/** Register the edit-comment HTTP endpoint. @default true */
	allowEditing?: boolean;
	/** Resolve public display data for comment authors. */
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>;
	/**
	 * @deprecated Configure the generic stack server auth provider instead.
	 * This RC field remains type-compatible until the v3 contraction and is no
	 * longer consulted for authorization or row visibility.
	 */
	resolveCurrentUserId?: (
		context: CommentsApiContext,
	) => Promise<string | null | undefined> | string | null | undefined;
}

/** A domain/HTTP error raised after Comments input/fact validation. */
export class CommentsOperationError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(
		statusCode: number,
		message: string,
		code = "COMMENTS_OPERATION_ERROR",
	) {
		super(message);
		this.name = "CommentsOperationError";
		this.statusCode = statusCode;
		this.code = code;
	}
}

function requestFields(request: Request | undefined): RequestFields {
	return request ? { request, headers: request.headers } : {};
}

function listContext(
	context: OperationContext<ListInput, ReadFacts>,
): CommentsListOperationContext {
	return Object.freeze({
		...context,
		query: context.input,
		...requestFields(context.request),
	});
}

function countContext(
	context: OperationContext<CountInput, ReadFacts>,
): CommentsCountOperationContext {
	return Object.freeze({
		...context,
		query: context.input,
		...requestFields(context.request),
	});
}

function createContext(
	context: OperationContext<CreateInput, CreateFacts>,
): CommentsCreateOperationContext {
	return Object.freeze({
		...context,
		body: context.input,
		...requestFields(context.request),
	});
}

function editContext(
	context: OperationContext<UpdateInput, EditFacts>,
): CommentsEditOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		body: context.input.data,
		...requestFields(context.request),
	});
}

function reactContext(
	context: OperationContext<ToggleLikeInput, ReactFacts>,
): CommentsReactOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		...requestFields(context.request),
	});
}

function moderateContext(
	context: OperationContext<UpdateStatusInput, ModerateFacts>,
): CommentsModerateOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		body: context.input.data,
		...requestFields(context.request),
	});
}

function deleteContext(
	context: OperationContext<DeleteInput, DeleteFacts>,
): CommentsDeleteOperationContext {
	return Object.freeze({
		...context,
		params: Object.freeze({ id: context.input.id }),
		...requestFields(context.request),
	});
}

function readFactsForList(input: DeepReadonly<ListInput>): ReadFacts {
	if (input.authorId) {
		return { scope: "own", authorId: input.authorId };
	}
	const status = input.status ?? "approved";
	if (status === "approved" && input.resourceId && input.resourceType) {
		return {
			scope: "public",
			resourceId: input.resourceId,
			resourceType: input.resourceType,
		};
	}
	return {
		scope: "moderation",
		status,
		...(input.resourceId ? { resourceId: input.resourceId } : {}),
		...(input.resourceType ? { resourceType: input.resourceType } : {}),
	};
}

function readFactsForCount(input: DeepReadonly<CountInput>): ReadFacts {
	const status = input.status ?? "approved";
	return status === "approved"
		? {
				scope: "public",
				resourceId: input.resourceId,
				resourceType: input.resourceType,
			}
		: {
				scope: "moderation",
				status,
				resourceId: input.resourceId,
				resourceType: input.resourceType,
			};
}

async function requireComment(adapter: Adapter, id: string): Promise<Comment> {
	const comment = await adapter.findOne<Comment>({
		model: "comment",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!comment) {
		throw new CommentsOperationError(
			404,
			"Comment not found",
			"COMMENT_NOT_FOUND",
		);
	}
	return comment;
}

function commentStateChanged(): CommentsOperationError {
	return new CommentsOperationError(
		409,
		"Comment state changed while authorization was being evaluated. Retry the operation.",
		"COMMENT_STATE_CHANGED",
	);
}

async function assertCommentState(
	adapter: Adapter,
	id: string,
	matches: (comment: Comment) => boolean,
): Promise<Comment> {
	const comment = await requireComment(adapter, id);
	if (!matches(comment)) throw commentStateChanged();
	return comment;
}

async function assertReplyTarget(
	adapter: Adapter,
	input: DeepReadonly<CreateInput>,
): Promise<void> {
	if (!input.parentId) return;
	const parent = await requireComment(adapter, input.parentId);
	if (
		parent.parentId !== null ||
		parent.resourceId !== input.resourceId ||
		parent.resourceType !== input.resourceType
	) {
		throw new CommentsOperationError(
			409,
			"Reply target does not belong to this top-level comment thread.",
			"COMMENT_THREAD_MISMATCH",
		);
	}
}

async function serializeResolvedComment(
	adapter: Adapter,
	id: string,
	options: CommentsBackendOptions,
	currentUserId?: string,
) {
	const comment = await getCommentById(
		adapter,
		id,
		options.resolveUser,
		currentUserId,
	);
	if (!comment) {
		throw new CommentsOperationError(
			500,
			"Failed to retrieve comment after mutation",
			"COMMENT_SERIALIZATION_FAILED",
		);
	}
	return { ...comment };
}

function serializeCommentListResult(result: CommentListResult) {
	return {
		items: result.items.map((comment) => ({ ...comment })),
		total: result.total,
		limit: result.limit,
		offset: result.offset,
	};
}

function authoritativeAuthorId(
	identityId: string | undefined,
	trustedInputAuthorId: string | undefined,
): string {
	const authorId = identityId ?? trustedInputAuthorId;
	if (!authorId) {
		throw new CommentsOperationError(
			401,
			"Comment authorship requires an authenticated request identity or an explicit trusted internal authorId.",
			"COMMENT_AUTHOR_REQUIRED",
		);
	}
	return authorId;
}

/** Create the maintained Comments operation inventory for every server transport. */
export function createCommentsOperations(
	adapter: Adapter,
	options: CommentsBackendOptions,
) {
	// The v3 RC create hook used its return value to provide request authorship.
	// Keep that fallback only when the generic request identity and an explicit
	// trusted internal author are both absent. A configured auth adapter always
	// remains authoritative.
	const legacyHookAuthors = new WeakMap<object, string>();

	const listCommentsOperation = defineOperation({
		input: CommentListQuerySchema,
		permission: commentsPermissions.thread.read,
		facts: ({ input }) => readFactsForList(input),
		before: async (context) => {
			const lifecycle = listContext(context);
			if (context.input.authorId) {
				await options.onBeforeListByAuthor?.(
					context.input.authorId,
					context.input,
					lifecycle,
				);
			}
			await options.onBeforeList?.(context.input, lifecycle);
		},
		execute: async ({ input, identity }) =>
			serializeCommentListResult(
				await listComments(
					adapter,
					{
						...input,
						...(identity ? { currentUserId: identity.id } : {}),
					},
					options.resolveUser,
				),
			),
	});

	const getCommentCountOperation = defineOperation({
		input: CommentCountQuerySchema,
		permission: commentsPermissions.thread.read,
		facts: ({ input }) => readFactsForCount(input),
		before: async (context) => {
			await options.onBeforeCount?.(context.input, countContext(context));
		},
		execute: async ({ input }) => ({
			count: await getCommentCount(adapter, input),
		}),
	});

	const createCommentOperation = defineOperation({
		input: CreateCommentOperationInputSchema,
		permission: commentsPermissions.thread.createComment,
		facts: async ({ input }) => {
			await assertReplyTarget(adapter, input);
			return {
				resourceId: input.resourceId,
				resourceType: input.resourceType,
				parentId: input.parentId ?? null,
			};
		},
		before: async (context) => {
			if (options.allowPosting === false) {
				throw new CommentsOperationError(
					403,
					"Posting comments is disabled",
					"COMMENT_POSTING_DISABLED",
				);
			}
			const { authorId: _trustedAuthorId, ...publicInput } = context.input;
			const legacyAuthorship = await options.onBeforePost?.(
				publicInput,
				createContext(context),
			);
			if (
				!context.identity &&
				!context.input.authorId &&
				legacyAuthorship?.authorId
			) {
				legacyHookAuthors.set(context.input, legacyAuthorship.authorId);
			}
		},
		execute: async ({ input, identity }) => {
			const legacyHookAuthorId = legacyHookAuthors.get(input);
			legacyHookAuthors.delete(input);
			await assertReplyTarget(adapter, input);
			const authorId = authoritativeAuthorId(
				identity?.id,
				input.authorId ?? legacyHookAuthorId,
			);
			const created = await createCommentMutation(adapter, {
				resourceId: input.resourceId,
				resourceType: input.resourceType,
				parentId: input.parentId ?? null,
				body: input.body,
				authorId,
				status: options.autoApprove ? "approved" : "pending",
			});
			return serializeResolvedComment(adapter, created.id, options, authorId);
		},
		after: async (context) => {
			const base = createContext(context);
			await options.onAfterPost?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
	});

	const updateCommentOperation = defineOperation({
		input: UpdateCommentOperationInputSchema,
		permission: commentsPermissions.comment.edit,
		facts: async ({ input }) => {
			const comment = await requireComment(adapter, input.id);
			return {
				commentId: comment.id,
				authorId: comment.authorId,
				status: comment.status,
			};
		},
		before: async (context) => {
			if (options.allowEditing === false) {
				throw new CommentsOperationError(
					403,
					"Editing comments is disabled",
					"COMMENT_EDITING_DISABLED",
				);
			}
			await options.onBeforeEdit?.(
				context.input.id,
				context.input.data,
				editContext(context),
			);
		},
		execute: async ({ input, identity, facts }) => {
			await assertCommentState(
				adapter,
				input.id,
				(comment) =>
					comment.id === facts.commentId &&
					comment.authorId === facts.authorId &&
					comment.status === facts.status,
			);
			const updated = await updateCommentMutation(
				adapter,
				input.id,
				input.data.body,
			);
			if (!updated) {
				throw new CommentsOperationError(
					404,
					"Comment not found",
					"COMMENT_NOT_FOUND",
				);
			}
			return serializeResolvedComment(
				adapter,
				updated.id,
				options,
				identity?.id,
			);
		},
		after: async (context) => {
			const base = editContext(context);
			await options.onAfterEdit?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
	});

	const toggleLikeOperation = defineOperation({
		input: ToggleCommentLikeOperationInputSchema,
		permission: commentsPermissions.comment.react,
		facts: async ({ input }) => {
			const comment = await requireComment(adapter, input.id);
			return { commentId: comment.id, status: comment.status };
		},
		before: async (context) => {
			const authorId = authoritativeAuthorId(
				context.identity?.id,
				context.input.authorId,
			);
			await options.onBeforeLike?.(
				context.input.id,
				authorId,
				reactContext(context),
			);
		},
		execute: async ({ input, identity, facts }) => {
			await assertCommentState(
				adapter,
				input.id,
				(comment) =>
					comment.id === facts.commentId && comment.status === facts.status,
			);
			return toggleCommentLikeMutation(
				adapter,
				input.id,
				authoritativeAuthorId(identity?.id, input.authorId),
			);
		},
	});

	const updateCommentStatusOperation = defineOperation({
		input: UpdateCommentStatusOperationInputSchema,
		permission: commentsPermissions.comment.moderate,
		facts: async ({ input }) => {
			const comment = await requireComment(adapter, input.id);
			return {
				commentId: comment.id,
				resourceId: comment.resourceId,
				resourceType: comment.resourceType,
				status: comment.status,
			};
		},
		before: async (context) => {
			await options.onBeforeStatusChange?.(
				context.input.id,
				context.input.data.status,
				moderateContext(context),
			);
		},
		execute: async ({ input, identity, facts }) => {
			await assertCommentState(
				adapter,
				input.id,
				(comment) =>
					comment.id === facts.commentId &&
					comment.resourceId === facts.resourceId &&
					comment.resourceType === facts.resourceType &&
					comment.status === facts.status,
			);
			const updated = await updateCommentStatusMutation(
				adapter,
				input.id,
				input.data.status,
			);
			if (!updated) {
				throw new CommentsOperationError(
					404,
					"Comment not found",
					"COMMENT_NOT_FOUND",
				);
			}
			return serializeResolvedComment(
				adapter,
				updated.id,
				options,
				identity?.id,
			);
		},
		after: async (context) => {
			if (context.input.data.status !== "approved") return;
			const base = moderateContext(context);
			await options.onAfterApprove?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
	});

	const deleteCommentOperation = defineOperation({
		input: DeleteCommentOperationInputSchema,
		permission: commentsPermissions.comment.delete,
		facts: async ({ input }) => {
			const comment = await requireComment(adapter, input.id);
			return { commentId: comment.id, authorId: comment.authorId };
		},
		before: async (context) => {
			await options.onBeforeDelete?.(context.input.id, deleteContext(context));
		},
		execute: async ({ input, facts }) => {
			await assertCommentState(
				adapter,
				input.id,
				(comment) =>
					comment.id === facts.commentId && comment.authorId === facts.authorId,
			);
			const deleted = await deleteCommentMutation(adapter, input.id);
			if (!deleted) {
				throw new CommentsOperationError(
					404,
					"Comment not found",
					"COMMENT_NOT_FOUND",
				);
			}
			return { success: true } as const;
		},
		after: async (context) => {
			const base = deleteContext(context);
			await options.onAfterDelete?.(
				context.input.id,
				Object.freeze({ ...base, result: context.result }),
			);
		},
	});

	return {
		listComments: listCommentsOperation,
		getCommentCount: getCommentCountOperation,
		createComment: createCommentOperation,
		updateComment: updateCommentOperation,
		toggleLike: toggleLikeOperation,
		updateCommentStatus: updateCommentStatusOperation,
		deleteComment: deleteCommentOperation,
	} as const;
}

export type SerializedCommentListResult = CommentListResult;
