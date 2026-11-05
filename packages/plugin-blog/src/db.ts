import { createDbPlugin } from "@btst/db";

/**
 * Blog plugin schema
 * Defines the database table for blog posts
 */
export const blogSchema = createDbPlugin("blog", {
	post: {
		modelName: "post",
		fields: {
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
