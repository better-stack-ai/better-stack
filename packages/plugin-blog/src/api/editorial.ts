import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	OperationHttpError,
	type DeepReadonly,
	type OperationContext,
} from "@btst/stack/plugins/api";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import { z } from "zod";
import { blogPermissions } from "../permissions";
import type { EditorialAction, Post, SerializedEditorialPost } from "../types";
import {
	getPostBySlug,
	getWorkingPostBySlug,
	type StoredPostRevision,
} from "./getters";
import {
	activateEditorialWorkflow,
	appendRevision,
	postTags,
	writeTransaction,
} from "./mutations";
import { serializePost } from "./serializers";

/** Query for the separately authorized working-copy endpoint. */
export const EditorialPostQuerySchema = z.object({ slug: z.string().min(1) });
/** Both content and review state must still match the editor's tokens. */
export const EditorialTransitionInputSchema = z.object({
	id: z.string().min(1),
	expectedVersion: z.number().int().min(0),
	expectedEditorialVersion: z.number().int().min(0),
});
/** Optional reviewer feedback attached to the last transition. */
export const RequestPostChangesInputSchema =
	EditorialTransitionInputSchema.extend({
		comment: z.string().trim().max(2000).optional(),
	});
/** Publication is separate from saving content; false withdraws the live version. */
export const PublishPostInputSchema = EditorialTransitionInputSchema.extend({
	published: z.boolean().default(true),
});
type TransitionInput = z.output<typeof EditorialTransitionInputSchema> & {
	comment?: string;
	published?: boolean;
};
type EditorialFacts = PermissionFactsFor<typeof blogPermissions.post.submit> & {
	published?: boolean;
};
/** Authorized lifecycle context; identities and facts are supplied by the operation runtime. */
export type BlogEditorialTransitionContext = OperationContext<
	TransitionInput,
	EditorialFacts
> & { readonly action: EditorialAction };
/** Revision-bound review events. Applications can persist these hooks for a durable audit log. */
export interface BlogEditorialHooks {
	/** Runs after authorization; rejection leaves content and review state unchanged. */
	onBeforeEditorialTransition?: (
		context: BlogEditorialTransitionContext,
	) => void | Promise<void>;
	/** Runs after the transition commits. */
	onAfterEditorialTransition?: (
		context: BlogEditorialTransitionContext & {
			readonly result: DeepReadonly<SerializedEditorialPost>;
		},
	) => void | Promise<void>;
	/** Reports authorized failures; input, fact-loading, and authorization failures are excluded. */
	onErrorEditorialTransition?: (
		context: BlogEditorialTransitionContext & { readonly error: unknown },
	) => void | Promise<void>;
}

function conflict(
	message = "Post or review changed. Reload before continuing.",
): never {
	throw new OperationHttpError(409, message, "EDITORIAL_STATE_CHANGED");
}

/** Internal working-copy lookup accepting either the working or retained live slug. */
export async function getEditorialWorkingPost(adapter: Adapter, slug: string) {
	const post = await getWorkingPostBySlug(adapter, slug);
	if (post) return post;
	const live = await getPostBySlug(adapter, slug);
	if (!live) return null;
	const current = await adapter.findOne<Post>({
		model: "post",
		where: [{ field: "id", value: live.id }],
	});
	return current
		? { ...current, tags: await postTags(adapter, current.id) }
		: null;
}

export async function serializeEditorialPost(
	adapter: Omit<Adapter, "transaction">,
	post: Post,
	enabled: boolean,
) {
	const revision = await adapter.findOne<{ id: string }>({
		model: "postRevision",
		where: [
			{ field: "postId", value: post.id },
			{ field: "version", value: post.revisionVersion ?? 0 },
		],
	});
	const serialized = serializePost(post);
	return {
		...serialized,
		tags: serialized.tags.map((tag) => ({ ...tag })),
		editorial: {
			enabled: !!(enabled || post.editorialEnabled),
			status: post.editorialStatus ?? "draft",
			version: post.editorialVersion ?? 0,
			...(revision ? { revisionId: revision.id } : {}),
			...(post.editorialSubmittedRevisionId
				? { submittedRevisionId: post.editorialSubmittedRevisionId }
				: {}),
			...(post.editorialApprovedRevisionId
				? { approvedRevisionId: post.editorialApprovedRevisionId }
				: {}),
			...(post.editorialLiveRevisionId
				? { liveRevisionId: post.editorialLiveRevisionId }
				: {}),
			...(post.editorialLiveSlug ? { liveSlug: post.editorialLiveSlug } : {}),
			...(post.editorialActorId ? { actorId: post.editorialActorId } : {}),
			...(post.editorialUpdatedAt
				? { updatedAt: post.editorialUpdatedAt.toISOString() }
				: {}),
			...(post.editorialComment ? { comment: post.editorialComment } : {}),
		},
	};
}

export function createEditorialOperations(
	adapter: Adapter,
	enabled: boolean,
	hooks?: BlogEditorialHooks,
) {
	const factsFor = async (id: string) => {
		const post = await adapter.findOne<Post>({
			model: "post",
			where: [{ field: "id", value: id }],
		});
		return {
			id,
			...(post?.authorId ? { authorId: post.authorId } : {}),
			revisionVersion: post?.revisionVersion ?? 0,
			editorialVersion: post?.editorialVersion ?? 0,
			status: post?.editorialStatus ?? "draft",
		};
	};
	const getEditorialPost = defineOperation({
		input: EditorialPostQuerySchema,
		permission: blogPermissions.post.editorialRead,
		facts: async ({ input }) => {
			const post = await getEditorialWorkingPost(adapter, input.slug);
			return {
				id: post?.id ?? "",
				...(post?.authorId ? { authorId: post.authorId } : {}),
				exists: !!post,
			};
		},
		execute: async ({ input, facts }) => {
			const post = await getEditorialWorkingPost(adapter, input.slug);
			if (!post)
				throw new OperationHttpError(404, "Post not found", "POST_NOT_FOUND");
			if (post.id !== facts.id || post.authorId !== facts.authorId) conflict();
			return serializeEditorialPost(adapter, post, enabled);
		},
	});
	const transition = (action: EditorialAction) => ({
		before: async (
			context: OperationContext<TransitionInput, EditorialFacts>,
		) => {
			await hooks?.onBeforeEditorialTransition?.(
				Object.freeze({ ...context, action }),
			);
		},
		execute: async (
			context: OperationContext<TransitionInput, EditorialFacts>,
		) =>
			writeTransaction(adapter, async (tx) => {
				const { input, identity, facts } = context;
				const post = await tx.findOne<Post>({
					model: "post",
					where: [{ field: "id", value: input.id }],
				});
				if (!post)
					throw new OperationHttpError(404, "Post not found", "POST_NOT_FOUND");
				if (!enabled && !post.editorialEnabled)
					throw new OperationHttpError(
						409,
						"Editorial workflow is disabled.",
						"EDITORIAL_DISABLED",
					);
				const version = post.revisionVersion ?? 0;
				const editorialVersion = post.editorialVersion ?? 0;
				if (
					version !== input.expectedVersion ||
					editorialVersion !== input.expectedEditorialVersion ||
					facts.revisionVersion !== version ||
					facts.editorialVersion !== editorialVersion ||
					facts.authorId !== post.authorId ||
					facts.status !== (post.editorialStatus ?? "draft")
				)
					conflict();
				await activateEditorialWorkflow(tx);
				post.tags = await postTags(tx, post.id);
				let revision = await tx.findOne<StoredPostRevision>({
					model: "postRevision",
					where: [
						{ field: "postId", value: post.id },
						{ field: "version", value: version },
					],
				});
				if (!revision && version === 0) {
					const baseline = await appendRevision(tx, post, 1);
					revision = await tx.findOne<StoredPostRevision>({
						model: "postRevision",
						where: [{ field: "id", value: baseline.id }],
					});
				}
				if (!revision) conflict("The current content revision is missing.");
				const update: Partial<Post> = {
					editorialEnabled: true,
					editorialVersion: editorialVersion + 1,
					editorialActorId: identity?.id ?? null,
					editorialUpdatedAt: new Date(),
					editorialComment: input.comment ?? null,
					...(version === 0 ? { revisionVersion: 1 } : {}),
					...(!post.editorialEnabled && post.published
						? {
								editorialLiveRevisionId: revision.id,
								editorialLiveSlug: revision.slug,
							}
						: {}),
				};
				const status = post.editorialStatus ?? "draft";
				if (action === "submit") {
					if (status !== "draft" && status !== "changes-requested")
						conflict("Only a draft or requested revision can be submitted.");
					Object.assign(update, {
						editorialStatus: "submitted",
						editorialSubmittedRevisionId: revision.id,
						editorialApprovedRevisionId: null,
					});
				} else if (action === "requestChanges") {
					if (status !== "submitted" && status !== "approved")
						conflict(
							"Only submitted or approved content can have changes requested.",
						);
					Object.assign(update, {
						editorialStatus: "changes-requested",
						editorialApprovedRevisionId: null,
					});
				} else if (action === "approve") {
					if (
						status !== "submitted" ||
						post.editorialSubmittedRevisionId !== revision.id
					)
						conflict("Submit the current revision before approving.");
					Object.assign(update, {
						editorialStatus: "approved",
						editorialApprovedRevisionId: revision.id,
					});
				} else if (input.published === false) {
					Object.assign(update, {
						published: false,
						editorialLiveRevisionId: null,
						editorialLiveSlug: null,
					});
				} else {
					if (
						status !== "approved" ||
						post.editorialApprovedRevisionId !== revision.id
					)
						conflict(
							"The current revision must be approved before publication.",
						);
					Object.assign(update, {
						published: true,
						publishedAt: new Date(),
						editorialLiveRevisionId: revision.id,
						editorialLiveSlug: revision.slug,
					});
				}
				const updated = await tx.update<Post>({
					model: "post",
					where: [
						{ field: "id", value: post.id },
						{ field: "revisionVersion", value: version },
						{ field: "editorialVersion", value: editorialVersion },
					],
					update,
				});
				if (!updated) conflict();
				updated.tags = post.tags;
				return serializeEditorialPost(tx, updated, enabled);
			}),
		after: async (
			context: OperationContext<TransitionInput, EditorialFacts> & {
				readonly result: DeepReadonly<SerializedEditorialPost>;
			},
		) => {
			await hooks?.onAfterEditorialTransition?.(
				Object.freeze({ ...context, action }),
			);
		},
		onError: async (
			context: OperationContext<TransitionInput, EditorialFacts> & {
				readonly error: unknown;
			},
		) => {
			await hooks?.onErrorEditorialTransition?.(
				Object.freeze({ ...context, action }),
			);
		},
	});
	const submitPost = defineOperation({
		input: EditorialTransitionInputSchema,
		permission: blogPermissions.post.submit,
		facts: ({ input }) => factsFor(input.id),
		...transition("submit"),
	});
	const requestPostChanges = defineOperation({
		input: RequestPostChangesInputSchema,
		permission: blogPermissions.post.requestChanges,
		facts: ({ input }) => factsFor(input.id),
		...transition("requestChanges"),
	});
	const approvePost = defineOperation({
		input: EditorialTransitionInputSchema,
		permission: blogPermissions.post.approve,
		facts: ({ input }) => factsFor(input.id),
		...transition("approve"),
	});
	const publishPost = defineOperation({
		input: PublishPostInputSchema,
		permission: blogPermissions.post.publish,
		facts: async ({ input }) => ({
			...(await factsFor(input.id)),
			published: input.published,
		}),
		...transition("publish"),
	});
	return {
		getEditorialPost,
		submitPost,
		requestPostChanges,
		approvePost,
		publishPost,
	} as const;
}
