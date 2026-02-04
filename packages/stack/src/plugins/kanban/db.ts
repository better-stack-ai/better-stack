import { createDbPlugin } from "@btst/db";

/**
 * Kanban plugin schema
 * Defines the database tables for kanban boards, columns, and tasks
 */
export const kanbanSchema = createDbPlugin("kanban", {
	board: {
		modelName: "kanbanBoard",
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
			ownerId: {
				type: "string",
				required: false,
			},
			organizationId: {
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
	column: {
		modelName: "kanbanColumn",
		fields: {
			title: {
				type: "string",
				required: true,
			},
			order: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			boardId: {
				type: "string",
				required: true,
				references: {
					model: "kanbanBoard",
					field: "id",
					onDelete: "cascade",
				},
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
	task: {
		modelName: "kanbanTask",
		fields: {
			title: {
				type: "string",
				required: true,
			},
			description: {
				type: "string",
				required: false,
			},
			priority: {
				type: "string",
				required: true,
				defaultValue: "MEDIUM",
			},
			order: {
				type: "number",
				required: true,
				defaultValue: 0,
			},
			columnId: {
				type: "string",
				required: true,
				references: {
					model: "kanbanColumn",
					field: "id",
					onDelete: "cascade",
				},
			},
			assigneeId: {
				type: "string",
				required: false,
			},
			completedAt: {
				type: "date",
				required: false,
			},
			isArchived: {
				type: "boolean",
				defaultValue: false,
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
