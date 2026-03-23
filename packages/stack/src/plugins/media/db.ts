import { createDbPlugin } from "@btst/db";

/**
 * Media plugin schema
 * Defines the database tables for media assets and folders
 */
export const mediaSchema = createDbPlugin("media", {
	asset: {
		modelName: "mediaAsset",
		fields: {
			filename: {
				type: "string",
				required: true,
			},
			originalName: {
				type: "string",
				required: true,
			},
			mimeType: {
				type: "string",
				required: true,
			},
			size: {
				type: "number",
				required: true,
			},
			url: {
				type: "string",
				required: true,
			},
			folderId: {
				type: "string",
				required: false,
				references: {
					model: "mediaFolder",
					field: "id",
				},
			},
			alt: {
				type: "string",
				required: false,
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
	folder: {
		modelName: "mediaFolder",
		fields: {
			name: {
				type: "string",
				required: true,
			},
			parentId: {
				type: "string",
				required: false,
				references: {
					model: "mediaFolder",
					field: "id",
					onDelete: "cascade",
				},
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
});
