import { createDbPlugin } from "@btst/db";

export const feedbackSchema = createDbPlugin("feedback", {
	feedbackPost: {
		modelName: "feedbackPost",
		fields: {
			slug: { type: "string", required: true, unique: true },
			title: { type: "string", required: true },
			body: { type: "string", required: true },
			category: { type: "string", required: true },
			status: { type: "string", defaultValue: "under_review" },
			authorId: { type: "string", required: true },
			voteCount: { type: "number", defaultValue: 0 },
			lockVersion: { type: "string", required: true },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	feedbackVote: {
		modelName: "feedbackVote",
		fields: {
			key: { type: "string", required: true, unique: true },
			postId: {
				type: "string",
				required: true,
				references: { model: "feedbackPost", field: "id", onDelete: "cascade" },
			},
			userId: { type: "string", required: true },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	changelogEntry: {
		modelName: "changelogEntry",
		fields: {
			title: { type: "string", required: true },
			body: { type: "string", required: true },
			postIds: { type: "string", required: true },
			publishedAt: { type: "date", required: true },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
