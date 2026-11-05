import { createDbPlugin } from "@btst/db";

/** CRM records compose with the Kanban plugin's existing boards and tasks. */
export const crmSchema = createDbPlugin("crm", {
	company: {
		modelName: "crmCompany",
		fields: {
			name: { type: "string", required: true },
			domain: { type: "string", required: false },
			phone: { type: "string", required: false },
			notes: { type: "string", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	contact: {
		modelName: "crmContact",
		fields: {
			firstName: { type: "string", required: true },
			lastName: { type: "string", required: false },
			email: { type: "string", required: false },
			phone: { type: "string", required: false },
			company: { type: "string", required: false },
			title: { type: "string", required: false },
			notes: { type: "string", required: false },
			companyId: {
				type: "string",
				required: false,
				references: { model: "crmCompany", field: "id", onDelete: "set null" },
			},
			tags: { type: "string", defaultValue: "[]" },
			customFields: { type: "string", defaultValue: "{}" },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	pipeline: {
		modelName: "crmPipeline",
		fields: {
			boardId: {
				type: "string",
				required: true,
				unique: true,
				references: { model: "kanbanBoard", field: "id", onDelete: "cascade" },
			},
		},
	},
	deal: {
		modelName: "crmDeal",
		fields: {
			taskId: {
				type: "string",
				required: true,
				unique: true,
				references: { model: "kanbanTask", field: "id", onDelete: "cascade" },
			},
			value: { type: "number", required: false },
			currency: { type: "string", defaultValue: "USD" },
			contactId: {
				type: "string",
				required: false,
				references: { model: "crmContact", field: "id", onDelete: "set null" },
			},
			companyId: {
				type: "string",
				required: false,
				references: { model: "crmCompany", field: "id", onDelete: "set null" },
			},
			closeDate: { type: "date", required: false },
			status: { type: "string", defaultValue: "open" },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	activity: {
		modelName: "crmActivity",
		fields: {
			type: { type: "string", required: true },
			body: { type: "string", required: true },
			contactId: {
				type: "string",
				required: false,
				references: { model: "crmContact", field: "id", onDelete: "cascade" },
			},
			dealId: {
				type: "string",
				required: false,
				references: { model: "crmDeal", field: "id", onDelete: "cascade" },
			},
			dueAt: { type: "date", required: false },
			completedAt: { type: "date", required: false },
			remindedAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
