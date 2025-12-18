import { createDbPlugin } from "@btst/db";

/**
 * CMS plugin schema
 * Defines the database tables for content types and content items
 */
export const cmsSchema = createDbPlugin("cms", {
	contentType: {
		modelName: "contentType",
		fields: {
			name: {
				type: "string",
				required: true,
			},
			slug: {
				type: "string",
				required: true,
				unique: true,
			},
			description: {
				type: "string",
				required: false,
			},
			jsonSchema: {
				type: "string",
				required: true,
			},
			fieldConfig: {
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
	contentItem: {
		modelName: "contentItem",
		fields: {
			contentTypeId: {
				type: "string",
				required: true,
				references: {
					model: "contentType",
					field: "id",
					onDelete: "cascade",
				},
			},
			slug: {
				type: "string",
				required: true,
			},
			data: {
				type: "string",
				required: true,
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
});
