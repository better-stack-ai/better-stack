import type { DBAdapter as Adapter } from "@btst/db";
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { commentsSchema as dbSchema } from "../db";
import type { Comment } from "../types";
import {
	CommentListQuerySchema,
	CommentListParamsSchema,
	CommentCountQuerySchema,
	createCommentSchema,
	updateCommentSchema,
	updateCommentStatusSchema,
} from "../schemas";
import { listComments, getCommentById, getCommentCount } from "./getters";
import {
	createComment,
	updateComment,
	updateCommentStatus,
	deleteComment,
	toggleCommentLike,
} from "./mutations";
import { runHookWithShim } from "../../utils";

/**
 * Context passed to comments API hooks
 */
export interface CommentsApiContext {
	body?: unknown;
	params?: unknown;
	query?: unknown;
	request?: Request;
	headers?: Headers;
	[key: string]: unknown;
}

/** Shared hook and config fields that are always present regardless of allowPosting. */
interface CommentsBackendOptionsBase {
	/**
	 * When true, new comments are automatically approved (status: "approved").
	 * Default: false — all comments start as "pending" until a moderator approves.
	 */
	autoApprove?: boolean;

	/**
	 * When false, the `PATCH /comments/:id` endpoint is not registered and
	 * comment bodies cannot be edited.
	 * Default: true.
	 */
	allowEditing?: boolean;

	/**
	 * Server-side user resolution hook. Called once per unique authorId when
	 * serving GET /comments. Return null for deleted/unknown users (shown as "[deleted]").
	 * Deduplicates lookups — each unique authorId is resolved only once per request.
	 */
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>;

	/**
	 * Called before the comment list or count is returned. Throw to reject.
	 * When this hook is absent, any request with `status` other than "approved"
	 * is automatically rejected with 403 on both `GET /comments` and
	 * `GET /comments/count` — preventing anonymous callers from reading or
	 * probing the pending/spam moderation queues. Configure this hook to
	 * authorize admin callers (e.g. check session role).
	 */
	onBeforeList?: (
		query: z.infer<typeof CommentListQuerySchema>,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a comment is successfully created.
	 */
	onAfterPost?: (
		comment: Comment,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a comment body is edited. Throw an error to reject the edit.
	 * Use this to enforce that only the comment owner can edit (compare authorId to session).
	 */
	onBeforeEdit?: (
		commentId: string,
		update: { body: string },
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a comment is successfully edited.
	 */
	onAfterEdit?: (
		comment: Comment,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a like is toggled. Throw to reject.
	 *
	 * When this hook is **absent**, any like/unlike request is automatically
	 * rejected with 403 — preventing unauthenticated callers from toggling likes
	 * on behalf of arbitrary user IDs. Configure this hook to verify `authorId`
	 * matches the authenticated session.
	 */
	onBeforeLike?: (
		commentId: string,
		authorId: string,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a comment's status is changed. Throw to reject.
	 *
	 * When this hook is **absent**, any status-change request is automatically
	 * rejected with 403 — preventing unauthenticated callers from moderating
	 * comments. Configure this hook to verify the caller has admin/moderator
	 * privileges.
	 */
	onBeforeStatusChange?: (
		commentId: string,
		status: "pending" | "approved" | "spam",
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a comment status is changed to "approved".
	 */
	onAfterApprove?: (
		comment: Comment,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a comment is deleted. Throw to reject.
	 *
	 * When this hook is **absent**, any delete request is automatically rejected
	 * with 403 — preventing unauthenticated callers from deleting comments.
	 * Configure this hook to enforce admin-only access.
	 */
	onBeforeDelete?: (
		commentId: string,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called after a comment is deleted.
	 */
	onAfterDelete?: (
		commentId: string,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before the comment list is returned for an author-scoped query
	 * (i.e. when `authorId` is present in `GET /comments`). Throw to reject.
	 *
	 * When this hook is **absent**, any request that includes `authorId` is
	 * automatically rejected with 403 — preventing anonymous callers from
	 * reading or probing any user's comment history.
	 */
	onBeforeListByAuthor?: (
		authorId: string,
		query: z.infer<typeof CommentListQuerySchema>,
		context: CommentsApiContext,
	) => Promise<void> | void;
}

/**
 * Configuration options for the comments backend plugin.
 *
 * TypeScript enforces the security-critical hooks based on `allowPosting`:
 * - When `allowPosting` is absent or `true`, `onBeforePost` and
 *   `resolveCurrentUserId` are **required**.
 * - When `allowPosting` is `false`, both become optional (the POST endpoint
 *   is not registered so neither hook is ever called).
 */
export type CommentsBackendOptions = CommentsBackendOptionsBase &
	(
		| {
				/**
				 * Posting is enabled (default). `onBeforePost` and `resolveCurrentUserId`
				 * are required to prevent anonymous authorship and impersonation.
				 */
				allowPosting?: true;

				/**
				 * Called before a comment is created. Must return `{ authorId: string }` —
				 * the server-resolved identity of the commenter.
				 *
				 * ⚠️  SECURITY REQUIRED: Derive `authorId` from the authenticated session
				 * (e.g. JWT / session cookie). Never trust any ID supplied by the client.
				 * Throw to reject the request (e.g. when the user is not authenticated).
				 *
				 * `authorId` is intentionally absent from the POST body schema. This hook
				 * is the only place it can be set.
				 */
				onBeforePost: (
					input: z.infer<typeof createCommentSchema>,
					context: CommentsApiContext,
				) => Promise<{ authorId: string }> | { authorId: string };

				/**
				 * Resolve the current authenticated user's ID from the request context
				 * (e.g. session cookie or JWT). Used to include the user's own pending
				 * comments alongside approved ones in `GET /comments` responses so they
				 * remain visible immediately after posting.
				 *
				 * Return `null` or `undefined` for unauthenticated requests.
				 *
				 * ```ts
				 * resolveCurrentUserId: async (ctx) => {
				 *   const session = await getSession(ctx.headers)
				 *   return session?.user?.id ?? null
				 * }
				 * ```
				 */
				resolveCurrentUserId: (
					context: CommentsApiContext,
				) => Promise<string | null | undefined> | string | null | undefined;
		  }
		| {
				/**
				 * When `false`, the `POST /comments` endpoint is not registered.
				 * No new comments or replies can be submitted — users can only read
				 * existing comments. `onBeforePost` and `resolveCurrentUserId` become
				 * optional because they are never called.
				 */
				allowPosting: false;
				onBeforePost?: (
					input: z.infer<typeof createCommentSchema>,
					context: CommentsApiContext,
				) => Promise<{ authorId: string }> | { authorId: string };
				resolveCurrentUserId?: (
					context: CommentsApiContext,
				) => Promise<string | null | undefined> | string | null | undefined;
		  }
	);

export const commentsBackendPlugin = (options: CommentsBackendOptions) => {
	const postingEnabled = options.allowPosting !== false;
	const editingEnabled = options.allowEditing !== false;

	// Narrow once so closures below see fully-typed (non-optional) hooks.
	// TypeScript resolves onBeforePost / resolveCurrentUserId as required in
	// the allowPosting?: true branch, so these will be Hook | undefined — but
	// we only call them when postingEnabled is true.
	const onBeforePost =
		options.allowPosting !== false ? options.onBeforePost : undefined;
	const resolveCurrentUserId =
		options.allowPosting !== false ? options.resolveCurrentUserId : undefined;

	return defineBackendPlugin({
		name: "comments",
		dbPlugin: dbSchema,

		api: (adapter: Adapter) => ({
			listComments: (params: z.infer<typeof CommentListParamsSchema>) =>
				listComments(adapter, params, options?.resolveUser),
			getCommentById: (id: string, currentUserId?: string) =>
				getCommentById(adapter, id, options?.resolveUser, currentUserId),
			getCommentCount: (params: z.infer<typeof CommentCountQuerySchema>) =>
				getCommentCount(adapter, params),
		}),

		routes: (adapter: Adapter) => {
			// GET /comments
			const listCommentsEndpoint = createEndpoint(
				"/comments",
				{
					method: "GET",
					query: CommentListQuerySchema,
				},
				async (ctx) => {
					const context: CommentsApiContext = {
						query: ctx.query,
						request: ctx.request,
						headers: ctx.headers,
					};

					if (ctx.query.authorId) {
						if (!options?.onBeforeListByAuthor) {
							throw ctx.error(403, {
								message:
									"Forbidden: authorId filter requires onBeforeListByAuthor hook",
							});
						}
						await runHookWithShim(
							() =>
								options.onBeforeListByAuthor!(
									ctx.query.authorId!,
									ctx.query,
									context,
								),
							ctx.error,
							"Forbidden: Cannot list comments for this author",
						);
					}

					if (ctx.query.status && ctx.query.status !== "approved") {
						if (!options?.onBeforeList) {
							throw ctx.error(403, {
								message: "Forbidden: status filter requires authorization",
							});
						}
						await runHookWithShim(
							() => options.onBeforeList!(ctx.query, context),
							ctx.error,
							"Forbidden: Cannot list comments with this status filter",
						);
					} else if (options?.onBeforeList && !ctx.query.authorId) {
						await runHookWithShim(
							() => options.onBeforeList!(ctx.query, context),
							ctx.error,
							"Forbidden: Cannot list comments",
						);
					}

					let resolvedCurrentUserId: string | undefined;
					if (resolveCurrentUserId) {
						try {
							const result = await resolveCurrentUserId(context);
							resolvedCurrentUserId = result ?? undefined;
						} catch {
							resolvedCurrentUserId = undefined;
						}
					}

					return await listComments(
						adapter,
						{ ...ctx.query, currentUserId: resolvedCurrentUserId },
						options?.resolveUser,
					);
				},
			);

			// POST /comments
			const createCommentEndpoint = createEndpoint(
				"/comments",
				{
					method: "POST",
					body: createCommentSchema,
				},
				async (ctx) => {
					if (!postingEnabled) {
						throw ctx.error(403, { message: "Posting comments is disabled" });
					}

					const context: CommentsApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					const { authorId } = await runHookWithShim(
						() => onBeforePost!(ctx.body, context),
						ctx.error,
						"Unauthorized: Cannot post comment",
					);

					const status = options?.autoApprove ? "approved" : "pending";
					const comment = await createComment(adapter, {
						...ctx.body,
						authorId,
						status,
					});

					if (options?.onAfterPost) {
						await options.onAfterPost(comment, context);
					}

					const serialized = await getCommentById(
						adapter,
						comment.id,
						options?.resolveUser,
					);
					if (!serialized) {
						throw ctx.error(500, {
							message: "Failed to retrieve created comment",
						});
					}
					return serialized;
				},
			);

			// PATCH /comments/:id (edit body)
			const updateCommentEndpoint = createEndpoint(
				"/comments/:id",
				{
					method: "PATCH",
					body: updateCommentSchema,
				},
				async (ctx) => {
					if (!editingEnabled) {
						throw ctx.error(403, { message: "Editing comments is disabled" });
					}

					const { id } = ctx.params;
					const context: CommentsApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};

					if (!options?.onBeforeEdit) {
						throw ctx.error(403, {
							message:
								"Forbidden: editing comments requires the onBeforeEdit hook",
						});
					}
					await runHookWithShim(
						() => options.onBeforeEdit!(id, { body: ctx.body.body }, context),
						ctx.error,
						"Unauthorized: Cannot edit comment",
					);

					const updated = await updateComment(adapter, id, ctx.body.body);
					if (!updated) {
						throw ctx.error(404, { message: "Comment not found" });
					}

					if (options?.onAfterEdit) {
						await options.onAfterEdit(updated, context);
					}

					const serialized = await getCommentById(
						adapter,
						updated.id,
						options?.resolveUser,
					);
					if (!serialized) {
						throw ctx.error(500, {
							message: "Failed to retrieve updated comment",
						});
					}
					return serialized;
				},
			);

			// GET /comments/count
			const getCommentCountEndpoint = createEndpoint(
				"/comments/count",
				{
					method: "GET",
					query: CommentCountQuerySchema,
				},
				async (ctx) => {
					const context: CommentsApiContext = {
						query: ctx.query,
						headers: ctx.headers,
					};

					if (ctx.query.status && ctx.query.status !== "approved") {
						if (!options?.onBeforeList) {
							throw ctx.error(403, {
								message: "Forbidden: status filter requires authorization",
							});
						}
						await runHookWithShim(
							() =>
								options.onBeforeList!(
									{ ...ctx.query, status: ctx.query.status },
									context,
								),
							ctx.error,
							"Forbidden: Cannot count comments with this status filter",
						);
					} else if (options?.onBeforeList) {
						await runHookWithShim(
							() =>
								options.onBeforeList!(
									{ ...ctx.query, status: ctx.query.status },
									context,
								),
							ctx.error,
							"Forbidden: Cannot count comments",
						);
					}

					const count = await getCommentCount(adapter, ctx.query);
					return { count };
				},
			);

			// POST /comments/:id/like (toggle)
			const toggleLikeEndpoint = createEndpoint(
				"/comments/:id/like",
				{
					method: "POST",
					body: z.object({ authorId: z.string().min(1) }),
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context: CommentsApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};

					if (!options?.onBeforeLike) {
						throw ctx.error(403, {
							message:
								"Forbidden: toggling likes requires the onBeforeLike hook",
						});
					}
					await runHookWithShim(
						() => options.onBeforeLike!(id, ctx.body.authorId, context),
						ctx.error,
						"Unauthorized: Cannot like comment",
					);

					const result = await toggleCommentLike(
						adapter,
						id,
						ctx.body.authorId,
					);
					return result;
				},
			);

			// PATCH /comments/:id/status (admin)
			const updateStatusEndpoint = createEndpoint(
				"/comments/:id/status",
				{
					method: "PATCH",
					body: updateCommentStatusSchema,
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context: CommentsApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};

					if (!options?.onBeforeStatusChange) {
						throw ctx.error(403, {
							message:
								"Forbidden: changing comment status requires the onBeforeStatusChange hook",
						});
					}
					await runHookWithShim(
						() => options.onBeforeStatusChange!(id, ctx.body.status, context),
						ctx.error,
						"Unauthorized: Cannot change comment status",
					);

					const updated = await updateCommentStatus(
						adapter,
						id,
						ctx.body.status,
					);
					if (!updated) {
						throw ctx.error(404, { message: "Comment not found" });
					}

					if (ctx.body.status === "approved" && options?.onAfterApprove) {
						await options.onAfterApprove(updated, context);
					}

					const serialized = await getCommentById(
						adapter,
						updated.id,
						options?.resolveUser,
					);
					if (!serialized) {
						throw ctx.error(500, {
							message: "Failed to retrieve updated comment",
						});
					}
					return serialized;
				},
			);

			// DELETE /comments/:id (admin)
			const deleteCommentEndpoint = createEndpoint(
				"/comments/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context: CommentsApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					if (!options?.onBeforeDelete) {
						throw ctx.error(403, {
							message:
								"Forbidden: deleting comments requires the onBeforeDelete hook",
						});
					}
					await runHookWithShim(
						() => options.onBeforeDelete!(id, context),
						ctx.error,
						"Unauthorized: Cannot delete comment",
					);

					const deleted = await deleteComment(adapter, id);
					if (!deleted) {
						throw ctx.error(404, { message: "Comment not found" });
					}

					if (options?.onAfterDelete) {
						await options.onAfterDelete(id, context);
					}

					return { success: true };
				},
			);

			return {
				listComments: listCommentsEndpoint,
				...(postingEnabled && { createComment: createCommentEndpoint }),
				...(editingEnabled && { updateComment: updateCommentEndpoint }),
				getCommentCount: getCommentCountEndpoint,
				toggleLike: toggleLikeEndpoint,
				updateCommentStatus: updateStatusEndpoint,
				deleteComment: deleteCommentEndpoint,
			} as const;
		},
	});
};

export type CommentsApiRouter = ReturnType<
	ReturnType<typeof commentsBackendPlugin>["routes"]
>;
