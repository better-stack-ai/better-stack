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
			autoFormVersion: {
				type: "number",
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
	/**
	 * Junction table for content item relationships
	 * Stores many-to-many and one-to-many relations between content items
	 */
	contentRelation: {
		modelName: "contentRelation",
		fields: {
			/** The content item that has the relation field */
			sourceId: {
				type: "string",
				required: true,
				references: {
					model: "contentItem",
					field: "id",
					onDelete: "cascade",
				},
			},
			/** The content item being referenced */
			targetId: {
				type: "string",
				required: true,
				references: {
					model: "contentItem",
					field: "id",
					onDelete: "cascade",
				},
			},
			/** The field name in the source content type schema (e.g., "categoryIds") */
			fieldName: {
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
