import { createDbPlugin } from "@btst/stack/plugins/api";

/**
 * Todos plugin schema
 * Defines the database table for todos
 */
export const todosSchema = createDbPlugin("todos", {
	todo: {
		modelName: "todo",
		fields: {
			title: {
				type: "string",
				required: true,
			},
			completed: {
				type: "boolean",
				defaultValue: false,
			},
			createdAt: {
				type: "date",
				defaultValue: () => new Date(),
			},
		},
	},
});
