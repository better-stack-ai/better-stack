import type { DBAdapter as Adapter } from "@btst/db";
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { commentsSchema as dbSchema } from "../db";
import type { Comment } from "../types";
import {
	CommentListQuerySchema,
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

/**
 * Configuration options for the comments backend plugin
 */
export interface CommentsBackendOptions {
	/**
	 * When true, new comments are automatically approved (status: "approved").
	 * Default: false — all comments start as "pending" until a moderator approves.
	 */
	autoApprove?: boolean;

	/**
	 * Server-side user resolution hook. Called once per unique authorId when
	 * serving GET /comments. Return null for deleted/unknown users (shown as "[deleted]").
	 * Deduplicates lookups — each unique authorId is resolved only once per request.
	 */
	resolveUser?: (
		authorId: string,
	) => Promise<{ name: string; avatarUrl?: string } | null>;

	/**
	 * Called before the comment list is returned. Throw to reject.
	 * When this hook is absent, any request with `status` other than "approved"
	 * is automatically rejected with 403 — preventing anonymous callers from
	 * reading the pending/spam moderation queues. Configure this hook to
	 * authorize admin callers (e.g. check session role).
	 */
	onBeforeList?: (
		query: z.infer<typeof CommentListQuerySchema>,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a comment is created. Throw an error to reject the comment.
	 *
	 * ⚠️  SECURITY: This is the only server-side identity gate for comment
	 * creation. Always verify that `input.authorId` matches the authenticated
	 * session (e.g. verify JWT/session cookie). Without this hook, any caller
	 * can post a comment attributed to any arbitrary user ID.
	 */
	onBeforePost?: (
		input: z.infer<typeof createCommentSchema>,
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
	 * Use this to verify that `authorId` matches the authenticated session —
	 * without this hook any caller can like or unlike on behalf of any user ID.
	 */
	onBeforeLike?: (
		commentId: string,
		authorId: string,
		context: CommentsApiContext,
	) => Promise<void> | void;

	/**
	 * Called before a comment's status is changed. Throw to reject.
	 * Use this to enforce admin-only access to the moderation endpoint —
	 * the endpoint is otherwise unprotected at the network layer.
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
	 * Use this to enforce admin-only access — the CommentCard UI hides the
	 * Delete button behind an ownership check, but that is client-side only.
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
}

export const commentsBackendPlugin = (options?: CommentsBackendOptions) => {
	if (!options?.onBeforePost) {
		console.warn(
			"[btst/comments] onBeforePost is not configured. " +
				"Any caller can post a comment attributed to any user ID. " +
				"Add onBeforePost to verify the session and that input.authorId matches the authenticated user.",
		);
	}

	return defineBackendPlugin({
		name: "comments",
		dbPlugin: dbSchema,

		api: (adapter: Adapter) => ({
			listComments: (params: z.infer<typeof CommentListQuerySchema>) =>
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
						headers: ctx.headers,
					};
					try {
						// Restrict non-approved status filters to authorized callers only.
						// Without onBeforeList, anonymous callers cannot read pending/spam queues.
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
						} else if (options?.onBeforeList) {
							await runHookWithShim(
								() => options.onBeforeList!(ctx.query, context),
								ctx.error,
								"Forbidden: Cannot list comments",
							);
						}

						return await listComments(adapter, ctx.query, options?.resolveUser);
					} catch (error) {
						throw error;
					}
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
					const context: CommentsApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};
					try {
						if (options?.onBeforePost) {
							await runHookWithShim(
								() => options.onBeforePost!(ctx.body, context),
								ctx.error,
								"Unauthorized: Cannot post comment",
							);
						}

						const status = options?.autoApprove ? "approved" : "pending";
						const comment = await createComment(adapter, {
							...ctx.body,
							status,
						});

						if (options?.onAfterPost) {
							await options.onAfterPost(comment, context);
						}

						return comment;
					} catch (error) {
						throw error;
					}
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
					const { id } = ctx.params;
					const context: CommentsApiContext = {
						params: ctx.params,
						body: ctx.body,
						headers: ctx.headers,
					};
					try {
						if (options?.onBeforeEdit) {
							await runHookWithShim(
								() =>
									options.onBeforeEdit!(id, { body: ctx.body.body }, context),
								ctx.error,
								"Unauthorized: Cannot edit comment",
							);
						}

						const updated = await updateComment(adapter, id, ctx.body.body);
						if (!updated) {
							throw ctx.error(404, { message: "Comment not found" });
						}

						if (options?.onAfterEdit) {
							await options.onAfterEdit(updated, context);
						}

						return updated;
					} catch (error) {
						throw error;
					}
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
					try {
						const count = await getCommentCount(adapter, ctx.query);
						return { count };
					} catch (error) {
						throw error;
					}
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
					try {
						if (options?.onBeforeLike) {
							await runHookWithShim(
								() => options.onBeforeLike!(id, ctx.body.authorId, context),
								ctx.error,
								"Unauthorized: Cannot like comment",
							);
						}

						const result = await toggleCommentLike(
							adapter,
							id,
							ctx.body.authorId,
						);
						return result;
					} catch (error) {
						throw error;
					}
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
					try {
						if (options?.onBeforeStatusChange) {
							await runHookWithShim(
								() =>
									options.onBeforeStatusChange!(id, ctx.body.status, context),
								ctx.error,
								"Unauthorized: Cannot change comment status",
							);
						}

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

						return updated;
					} catch (error) {
						throw error;
					}
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
					try {
						if (options?.onBeforeDelete) {
							await runHookWithShim(
								() => options.onBeforeDelete!(id, context),
								ctx.error,
								"Unauthorized: Cannot delete comment",
							);
						}

						const deleted = await deleteComment(adapter, id);
						if (!deleted) {
							throw ctx.error(404, { message: "Comment not found" });
						}

						if (options?.onAfterDelete) {
							await options.onAfterDelete(id, context);
						}

						return { success: true };
					} catch (error) {
						throw error;
					}
				},
			);

			return {
				listComments: listCommentsEndpoint,
				createComment: createCommentEndpoint,
				updateComment: updateCommentEndpoint,
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
