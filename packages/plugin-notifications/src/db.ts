import { createDbPlugin } from "@btst/db";

export const notificationsSchema = createDbPlugin("notifications", {
	notification: {
		modelName: "notification",
		fields: {
			recipientId: { type: "string", required: true },
			category: { type: "string", required: true },
			title: { type: "string", required: true },
			body: { type: "string", required: true },
			href: { type: "string", required: false },
			readAt: { type: "date", required: false },
			archivedAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	notificationPreference: {
		modelName: "notificationPreference",
		fields: {
			key: { type: "string", required: true, unique: true },
			recipientId: { type: "string", required: true },
			category: { type: "string", required: true },
			inApp: { type: "boolean", defaultValue: true },
			email: { type: "boolean", defaultValue: false },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
