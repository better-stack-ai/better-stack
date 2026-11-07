import { createDbPlugin } from "@btst/db";

/** Helpdesk storage, with internal notes retained only in the agent conversation. */
export const helpdeskSchema = createDbPlugin("helpdesk", {
	helpdeskTicket: {
		modelName: "helpdeskTicket",
		fields: {
			subject: { type: "string", required: true },
			status: { type: "string", required: true },
			priority: { type: "string", required: true },
			customerId: { type: "string", required: true },
			requesterEmail: { type: "string", required: false },
			assigneeId: { type: "string", required: false },
			lockVersion: { type: "string", required: true },
			slaDueAt: { type: "date", required: true },
			resolutionDueAt: { type: "date", required: false },
			slaPolicy: { type: "string", required: false },
			firstRespondedAt: { type: "date", required: false },
			resolvedAt: { type: "date", required: false },
			createdAt: { type: "date", required: true },
			updatedAt: { type: "date", required: true },
		},
	},
	helpdeskMessage: {
		modelName: "helpdeskMessage",
		fields: {
			ticketId: {
				type: "string",
				required: true,
				references: {
					model: "helpdeskTicket",
					field: "id",
					onDelete: "cascade",
				},
			},
			body: { type: "string", required: true },
			authorId: { type: "string", required: true },
			authorType: { type: "string", required: true },
			isInternalNote: { type: "boolean", required: true },
			createdAt: { type: "date", required: true },
		},
	},
	helpdeskAttachment: {
		modelName: "helpdeskAttachment",
		fields: {
			ticketId: {
				type: "string",
				required: true,
				references: {
					model: "helpdeskTicket",
					field: "id",
					onDelete: "cascade",
				},
			},
			messageId: {
				type: "string",
				required: false,
				references: {
					model: "helpdeskMessage",
					field: "id",
					onDelete: "cascade",
				},
			},
			ownerId: { type: "string", required: true },
			isInternalNote: { type: "boolean", required: true },
			storageKey: { type: "string", required: true },
			ready: { type: "boolean", required: true },
			filename: { type: "string", required: true },
			mimeType: { type: "string", required: true },
			size: { type: "number", required: true },
			createdAt: { type: "date", required: true },
		},
	},

	helpdeskCannedReply: {
		modelName: "helpdeskCannedReply",
		fields: {
			title: { type: "string", required: true },
			body: { type: "string", required: true },
			createdAt: { type: "date", required: true },
			updatedAt: { type: "date", required: true },
		},
	},
});
