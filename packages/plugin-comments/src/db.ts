import { createDbPlugin } from "@btst/db";

/**
 * Comments plugin schema.
 * Defines two tables:
 * - comment: the main comment record (always authenticated, no anonymous)
 * - commentLike: join table for per-user like deduplication
 */
export const commentsSchema = createDbPlugin("comments", {
	comment: {
		modelName: "comment",
		fields: {
			resourceId: {
				type: "string",
				required: true,
			},
			resourceType: {
				type: "string",
				required: true,
			},
			parentId: {
				type: "string",
				required: false,
			},
			authorId: {
				type: "string",
				required: true,
			},
			body: {
				type: "string",
				required: true,
			},
			status: {
				type: "string",
				defaultValue: "pending",
			},
			likes: {
				type: "number",
				defaultValue: 0,
			},
			editedAt: {
				type: "date",
				required: false,
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
			updatedAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
	commentLike: {
		modelName: "commentLike",
		fields: {
			commentId: {
				type: "string",
				required: true,
				references: {
					model: "comment",
					field: "id",
					onDelete: "cascade",
				},
			},
			authorId: {
				type: "string",
				required: true,
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
});
