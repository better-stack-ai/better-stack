import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { feedbackSchema } from "../db";
import {
	createChangelogEntrySchema,
	createFeedbackPostSchema,
	listChangelogSchema,
	listFeedbackPostsSchema,
	updateFeedbackStatusSchema,
} from "../schemas";
import { createFeedbackOperations } from "./operations";

/** Register Feedback models, authorized operations and HTTP endpoints. */
export const feedbackBackendPlugin = () =>
	defineBackendPlugin({
		id: "feedback",
		dbPlugin: feedbackSchema,
		operations: (adapter) => createFeedbackOperations(adapter),
		routes: (_adapter, _context, operations) => ({
			listPosts: createEndpoint(
				"/feedback/posts",
				{ method: "GET", query: listFeedbackPostsSchema, requireRequest: true },
				operations.listPosts.route((ctx) => ctx.query),
			),
			getPost: createEndpoint(
				"/feedback/posts/:slug",
				{ method: "GET", requireRequest: true },
				operations.getPost.route((ctx) => ({ slug: ctx.params.slug })),
			),
			createPost: createEndpoint(
				"/feedback/posts",
				{
					method: "POST",
					body: createFeedbackPostSchema,
					requireRequest: true,
				},
				operations.createPost.route((ctx) => ctx.body),
			),
			toggleVote: createEndpoint(
				"/feedback/posts/:id/vote",
				{ method: "POST", requireRequest: true },
				operations.toggleVote.route((ctx) => ({ id: ctx.params.id })),
			),
			updatePostStatus: createEndpoint(
				"/feedback/posts/:id/status",
				{
					method: "PUT",
					body: updateFeedbackStatusSchema,
					requireRequest: true,
				},
				operations.updatePostStatus.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			getRoadmap: createEndpoint(
				"/feedback/roadmap",
				{ method: "GET", requireRequest: true },
				operations.getRoadmap.route(() => ({})),
			),
			listChangelog: createEndpoint(
				"/feedback/changelog",
				{ method: "GET", query: listChangelogSchema, requireRequest: true },
				operations.listChangelog.route((ctx) => ctx.query),
			),
			createChangelogEntry: createEndpoint(
				"/feedback/changelog",
				{
					method: "POST",
					body: createChangelogEntrySchema,
					requireRequest: true,
				},
				operations.createChangelogEntry.route((ctx) => ctx.body),
			),
		}),
	});
/** HTTP endpoint types exposed by the Feedback backend plugin. */
export type FeedbackApiRouter = ReturnType<
	ReturnType<typeof feedbackBackendPlugin>["routes"]
>;
