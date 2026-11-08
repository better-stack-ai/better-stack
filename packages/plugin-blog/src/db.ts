import { createDbPlugin } from "@btst/db";

/**
 * Blog plugin schema
 * Defines the database table for blog posts
 */
export const blogSchema = createDbPlugin("blog", {
	post: {
		modelName: "post",
		indexes: [{ fields: ["published", "createdAt"] }],
		fields: {
			revisionVersion: { type: "number", defaultValue: 0 },
			editorialEnabled: { type: "boolean", defaultValue: false },
			editorialVersion: { type: "number", defaultValue: 0 },
			editorialStatus: { type: "string", defaultValue: "draft" },
			editorialSubmittedRevisionId: { type: "string", required: false },
			editorialApprovedRevisionId: { type: "string", required: false },
			editorialLiveRevisionId: { type: "string", required: false },
			editorialLiveSlug: { type: "string", required: false, unique: true },
			editorialActorId: { type: "string", required: false },
			editorialUpdatedAt: { type: "date", required: false },
			editorialComment: { type: "string", required: false },
			title: {
				type: "string",
				required: true,
			},
			content: {
				type: "string",
				required: true,
			},
			excerpt: {
				type: "string",
				defaultValue: "",
			},
			slug: {
				type: "string",
				required: true,
				unique: true,
			},
			image: {
				type: "string",
				required: false,
			},
			published: {
				type: "boolean",
				defaultValue: false,
			},
			publishedAt: {
				type: "date",
				required: false,
			},
			authorId: {
				type: "string",
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
	editorialActivation: {
		modelName: "editorialActivation",
		fields: { activatedAt: { type: "date", required: true } },
	},
	postRevision: {
		modelName: "postRevision",
		fields: {
			postId: {
				type: "string",
				required: true,
				references: { model: "post", field: "id", onDelete: "cascade" },
			},
			revisionKey: { type: "string", required: true, unique: true },
			version: { type: "number", required: true },
			title: { type: "string", required: true },
			content: { type: "string", required: true },
			excerpt: { type: "string", required: true },
			slug: { type: "string", required: true },
			image: { type: "string", required: false },
			tags: { type: "string", required: true },
			published: { type: "boolean", required: true },
			publishedAt: { type: "date", required: false },
			actorId: { type: "string", required: false },
			createdAt: { type: "date", required: true },
		},
	},
	tag: {
		modelName: "tag",
		fields: {
			name: {
				type: "string",
				required: true,
				unique: true,
			},
			slug: {
				type: "string",
				required: true,
				unique: true,
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
	postTag: {
		modelName: "postTag",
		fields: {
			postId: {
				type: "string",
				required: true,
				references: {
					model: "post",
					field: "id",
					onDelete: "cascade",
				},
			},
			tagId: {
				type: "string",
				required: true,
				references: {
					model: "tag",
					field: "id",
					onDelete: "cascade",
				},
			},
		},
	},
});
