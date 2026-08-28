import type { DBAdapter as Adapter } from "@btst/db";
export { COMMENTS_LIFECYCLE_HOOK_MIGRATIONS } from "./lifecycle-migrations";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { commentsSchema as dbSchema } from "../db";
import {
	CommentCountQuerySchema,
	CommentListQuerySchema,
	createCommentSchema,
	updateCommentSchema,
	updateCommentStatusSchema,
} from "../schemas";
import {
	ToggleCommentLikeOperationInputSchema,
	createCommentsOperations,
	type CommentsBackendOptions,
} from "./operations";

export {
	CreateCommentOperationInputSchema,
	DeleteCommentOperationInputSchema,
	ToggleCommentLikeOperationInputSchema,
	UpdateCommentOperationInputSchema,
	UpdateCommentStatusOperationInputSchema,
} from "./operations";
export type {
	CommentsBackendHooks,
	CommentsBackendOptions,
	CommentsCountOperationContext,
	CommentsCreateOperationContext,
	CommentsCreateResultContext,
	CommentsDeleteOperationContext,
	CommentsDeleteResultContext,
	CommentsEditOperationContext,
	CommentsEditResultContext,
	CommentsListOperationContext,
	CommentsModerateOperationContext,
	CommentsModerateResultContext,
	CommentsReactOperationContext,
	SerializedCommentListResult,
} from "./operations";

/**
 * Comments backend plugin. Maintained HTTP endpoints adapt the same operation
 * inventory exposed by `forRequest(request).api.comments` and
 * `internal.comments`.
 */
export const commentsBackendPlugin = (options: CommentsBackendOptions = {}) => {
	const postingEnabled = options.allowPosting !== false;
	const editingEnabled = options.allowEditing !== false;

	return defineBackendPlugin({
		id: "comments",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createCommentsOperations(adapter, options),

		/**
		 * Explicit lower-level data API for SSG, jobs, and migration code.
		 * These getters bypass request authorization and lifecycle composition.
		 */
		routes: (_adapter: Adapter, _context, operations) => {
			const listCommentsEndpoint = createEndpoint(
				"/comments",
				{
					method: "GET",
					query: CommentListQuerySchema,
					requireRequest: true,
				},
				operations.listComments.route((ctx) => ctx.query),
			);

			const createCommentEndpoint = createEndpoint(
				"/comments",
				{
					method: "POST",
					body: createCommentSchema,
					requireRequest: true,
				},
				operations.createComment.route((ctx) => ctx.body),
			);

			const updateCommentEndpoint = createEndpoint(
				"/comments/:id",
				{
					method: "PATCH",
					body: updateCommentSchema,
					requireRequest: true,
				},
				operations.updateComment.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);

			const getCommentCountEndpoint = createEndpoint(
				"/comments/count",
				{
					method: "GET",
					query: CommentCountQuerySchema,
					requireRequest: true,
				},
				operations.getCommentCount.route((ctx) => ctx.query),
			);

			const toggleLikeEndpoint = createEndpoint(
				"/comments/:id/like",
				{
					method: "POST",
					body: ToggleCommentLikeOperationInputSchema.pick({ authorId: true }),
					requireRequest: true,
				},
				operations.toggleLike.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			);

			const updateCommentStatusEndpoint = createEndpoint(
				"/comments/:id/status",
				{
					method: "PATCH",
					body: updateCommentStatusSchema,
					requireRequest: true,
				},
				operations.updateCommentStatus.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);

			const deleteCommentEndpoint = createEndpoint(
				"/comments/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteComment.route((ctx) => ({ id: ctx.params.id })),
			);

			return {
				listComments: listCommentsEndpoint,
				...(postingEnabled && {
					createComment: createCommentEndpoint,
				}),
				...(editingEnabled && {
					updateComment: updateCommentEndpoint,
				}),
				getCommentCount: getCommentCountEndpoint,
				toggleLike: toggleLikeEndpoint,
				updateCommentStatus: updateCommentStatusEndpoint,
				deleteComment: deleteCommentEndpoint,
			} as const;
		},
	});
};

export type CommentsApiRouter = ReturnType<
	ReturnType<typeof commentsBackendPlugin>["routes"]
>;
