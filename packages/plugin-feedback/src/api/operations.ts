import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { feedbackPermissions as permissions } from "../permissions";
import {
	createChangelogEntrySchema,
	createFeedbackPostSchema,
	idSchema,
	listChangelogSchema,
	listFeedbackPostsSchema,
	updateFeedbackStatusSchema,
} from "../schemas";
import {
	getFeedbackPostBySlug,
	getFeedbackPostRecord,
	getFeedbackRoadmap,
	listChangelogEntries,
	listFeedbackPosts,
	serializeFeedbackPost,
} from "./getters";
import {
	createFeedbackChangelogEntry,
	createFeedbackPost,
	toggleFeedbackVote,
	updateFeedbackPostStatus,
} from "./mutations";

function notFound(): never {
	throw new OperationHttpError(
		404,
		"Feedback post not found",
		"FEEDBACK_NOT_FOUND",
	);
}
async function postFacts(adapter: Adapter, id: string) {
	const post = (await getFeedbackPostRecord(adapter, id)) ?? notFound();
	return { postId: post.id, status: post.status, authorId: post.authorId };
}
function actor(
	identityId: string | undefined,
	trustedId: string | undefined,
	request?: Request,
) {
	const id = identityId ?? (!request ? trustedId : undefined);
	if (!id)
		throw new OperationHttpError(
			401,
			"An authenticated user is required",
			"FEEDBACK_AUTH_REQUIRED",
		);
	return id;
}

export function createFeedbackOperations(adapter: Adapter) {
	return {
		listPosts: defineOperation({
			input: listFeedbackPostsSchema,
			permission: permissions.post.read,
			facts: () => ({ scope: "collection" as const }),
			execute: ({ input, identity }) =>
				listFeedbackPosts(adapter, input, identity?.id),
		}),
		getPost: defineOperation({
			input: z.object({ slug: z.string().min(1).max(200) }),
			permission: permissions.post.read,
			facts: async ({ input }) => {
				const post =
					(await getFeedbackPostBySlug(adapter, input.slug)) ?? notFound();
				return { scope: "record" as const, postId: post.id, slug: post.slug };
			},
			execute: async ({ input, identity }) =>
				serializeFeedbackPost(
					adapter,
					(await getFeedbackPostBySlug(adapter, input.slug)) ?? notFound(),
					identity?.id,
				),
		}),
		createPost: defineOperation({
			input: createFeedbackPostSchema.extend({
				authorId: z.string().min(1).max(200).optional(),
			}),
			permission: permissions.post.create,
			facts: () => undefined,
			execute: async ({ input, identity, request }) => {
				const authorId = actor(identity?.id, input.authorId, request);
				return serializeFeedbackPost(
					adapter,
					await createFeedbackPost(adapter, input, authorId),
					identity?.id,
				);
			},
		}),
		toggleVote: defineOperation({
			input: idSchema.extend({ userId: z.string().min(1).max(200).optional() }),
			permission: permissions.post.vote,
			facts: ({ input }) => postFacts(adapter, input.id),
			execute: ({ input, facts, identity, request }) =>
				toggleFeedbackVote(
					adapter,
					input.id,
					actor(identity?.id, input.userId, request),
					facts.status,
				),
		}),
		updatePostStatus: defineOperation({
			input: idSchema.extend(updateFeedbackStatusSchema.shape),
			permission: permissions.post.updateStatus,
			facts: ({ input }) => postFacts(adapter, input.id),
			execute: async ({ input, facts, identity }) =>
				serializeFeedbackPost(
					adapter,
					(await updateFeedbackPostStatus(
						adapter,
						input.id,
						input.status,
						facts.status,
					)) ?? notFound(),
					identity?.id,
				),
		}),
		getRoadmap: defineOperation({
			input: z.object({}),
			permission: permissions.post.read,
			facts: () => ({ scope: "collection" as const }),
			execute: ({ identity }) => getFeedbackRoadmap(adapter, identity?.id),
		}),
		listChangelog: defineOperation({
			input: listChangelogSchema,
			permission: permissions.changelog.read,
			facts: () => undefined,
			execute: ({ input, identity }) =>
				listChangelogEntries(adapter, input, identity?.id),
		}),
		createChangelogEntry: defineOperation({
			input: createChangelogEntrySchema,
			permission: permissions.changelog.create,
			facts: () => undefined,
			execute: ({ input }) =>
				createFeedbackChangelogEntry(adapter, {
					...input,
					postIds: [...input.postIds],
				}),
		}),
	};
}
