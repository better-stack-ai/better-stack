import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { AuthorizationError } from "../../../authorization/server";
import { commentsSchema as dbSchema } from "../db";
import {
	CommentCountQuerySchema,
	CommentListParamsSchema,
	CommentListQuerySchema,
	createCommentSchema,
	updateCommentSchema,
	updateCommentStatusSchema,
} from "../schemas";
import { getCommentById, getCommentCount, listComments } from "./getters";
import {
	CommentsOperationError,
	ToggleCommentLikeOperationInputSchema,
	createCommentsOperations,
	type CommentsBackendOptions,
} from "./operations";
import type { z } from "zod";

export {
	CreateCommentOperationInputSchema,
	DeleteCommentOperationInputSchema,
	ToggleCommentLikeOperationInputSchema,
	UpdateCommentOperationInputSchema,
	UpdateCommentStatusOperationInputSchema,
} from "./operations";
export type {
	CommentsApiContext,
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

type EndpointErrorFactory = (...args: any[]) => Error;

async function adaptOperationToHttp<TResult>(
	execute: () => Promise<TResult>,
	error: EndpointErrorFactory,
): Promise<TResult> {
	try {
		return await execute();
	} catch (cause) {
		if (
			cause instanceof AuthorizationError ||
			cause instanceof CommentsOperationError
		) {
			throw error(cause.statusCode, {
				message: cause.message,
				code: cause.code,
			});
		}
		throw cause;
	}
}

/**
 * Comments backend plugin. Maintained HTTP endpoints adapt the same operation
 * inventory exposed by `forRequest(request).api.comments` and
 * `internal.comments`.
 */
export const commentsBackendPlugin = (options: CommentsBackendOptions = {}) => {
	const postingEnabled = options.allowPosting !== false;
	const editingEnabled = options.allowEditing !== false;

	return defineBackendPlugin({
		name: "comments",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createCommentsOperations(adapter, options),

		/**
		 * Explicit lower-level data API for SSG, jobs, and migration code.
		 * These getters bypass request authorization and lifecycle composition.
		 */
		api: (adapter: Adapter) => ({
			listComments: (params: z.infer<typeof CommentListParamsSchema>) =>
				listComments(adapter, params, options.resolveUser),
			getCommentById: (id: string, currentUserId?: string) =>
				getCommentById(adapter, id, options.resolveUser, currentUserId),
			getCommentCount: (params: z.infer<typeof CommentCountQuerySchema>) =>
				getCommentCount(adapter, params),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listCommentsEndpoint = createEndpoint(
				"/comments",
				{
					method: "GET",
					query: CommentListQuerySchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.listComments(ctx.query, ctx.request),
						ctx.error,
					),
			);

			const createCommentEndpoint = createEndpoint(
				"/comments",
				{
					method: "POST",
					body: createCommentSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createComment(ctx.body, ctx.request),
						ctx.error,
					),
			);

			const updateCommentEndpoint = createEndpoint(
				"/comments/:id",
				{
					method: "PATCH",
					body: updateCommentSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateComment(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);

			const getCommentCountEndpoint = createEndpoint(
				"/comments/count",
				{
					method: "GET",
					query: CommentCountQuerySchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getCommentCount(ctx.query, ctx.request),
						ctx.error,
					),
			);

			const toggleLikeEndpoint = createEndpoint(
				"/comments/:id/like",
				{
					method: "POST",
					body: ToggleCommentLikeOperationInputSchema.pick({ authorId: true }),
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.toggleLike(
								{ id: ctx.params.id, ...ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);

			const updateCommentStatusEndpoint = createEndpoint(
				"/comments/:id/status",
				{
					method: "PATCH",
					body: updateCommentStatusSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateCommentStatus(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);

			const deleteCommentEndpoint = createEndpoint(
				"/comments/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deleteComment({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);

			return {
				listComments: operations.listComments.route(listCommentsEndpoint),
				...(postingEnabled && {
					createComment: operations.createComment.route(createCommentEndpoint),
				}),
				...(editingEnabled && {
					updateComment: operations.updateComment.route(updateCommentEndpoint),
				}),
				getCommentCount: operations.getCommentCount.route(
					getCommentCountEndpoint,
				),
				toggleLike: operations.toggleLike.route(toggleLikeEndpoint),
				updateCommentStatus: operations.updateCommentStatus.route(
					updateCommentStatusEndpoint,
				),
				deleteComment: operations.deleteComment.route(deleteCommentEndpoint),
			} as const;
		},
	});
};

export type CommentsApiRouter = ReturnType<
	ReturnType<typeof commentsBackendPlugin>["routes"]
>;
