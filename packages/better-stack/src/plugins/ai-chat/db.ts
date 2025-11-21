import { createDbPlugin } from "@btst/db";

/**
 * AI Chat plugin schema
 * Defines the database tables for conversations and messages
 */
export const aiChatSchema = createDbPlugin("aiChat", {
	conversation: {
		modelName: "conversation",
		fields: {
			id: {
				type: "string",
				required: true,
				unique: true,
			},
			title: {
				type: "string",
				required: true,
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
	message: {
		modelName: "message",
		fields: {
			id: {
				type: "string",
				required: true,
				unique: true,
			},
			conversationId: {
				type: "string",
				required: true,
			},
			role: {
				type: "string",
				required: true,
			},
			content: {
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
