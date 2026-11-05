/** Lower-level writes bypass validation, authorization and lifecycle. Callers own those checks. */
import type { DBAdapter as Adapter } from "@btst/db";
import type { z } from "zod";
import type { DeepReadonly } from "@btst/stack/plugins/api";
import type {
	createContactSchema,
	updateContactSchema,
	createCompanySchema,
	updateCompanySchema,
	createDealSchema,
	updateDealSchema,
	createActivitySchema,
	updateActivitySchema,
	createPipelineSchema,
} from "../schemas";
import type {
	ContactRecord,
	CompanyRecord,
	DealRecord,
	ActivityRecord,
} from "../types";
import {
	createKanbanTask,
	findOrCreateKanbanBoard,
} from "@btst/plugin-kanban/api";
import { getPipeline } from "./getters";

export function createContact(
	adapter: Adapter,
	input: DeepReadonly<z.output<typeof createContactSchema>>,
) {
	return adapter.create<ContactRecord>({
		model: "crmContact",
		data: {
			...input,
			tags: JSON.stringify(input.tags),
			customFields: JSON.stringify(input.customFields),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}
export function updateContact(
	adapter: Adapter,
	id: string,
	input: DeepReadonly<z.output<typeof updateContactSchema>>,
) {
	return adapter.update<ContactRecord>({
		model: "crmContact",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			...input,
			...(input.tags !== undefined ? { tags: JSON.stringify(input.tags) } : {}),
			...(input.customFields !== undefined
				? { customFields: JSON.stringify(input.customFields) }
				: {}),
			updatedAt: new Date(),
		},
	});
}
export async function deleteContact(adapter: Adapter, id: string) {
	await adapter.updateMany({
		model: "crmDeal",
		where: [{ field: "contactId", value: id, operator: "eq" }],
		update: { contactId: null, updatedAt: new Date() },
	});
	await adapter.deleteMany({
		model: "crmActivity",
		where: [{ field: "contactId", value: id, operator: "eq" }],
	});
	await adapter.delete({
		model: "crmContact",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export function createCompany(
	adapter: Adapter,
	input: DeepReadonly<z.output<typeof createCompanySchema>>,
) {
	return adapter.create<CompanyRecord>({
		model: "crmCompany",
		data: { ...input, createdAt: new Date(), updatedAt: new Date() },
	});
}
export function updateCompany(
	adapter: Adapter,
	id: string,
	input: DeepReadonly<z.output<typeof updateCompanySchema>>,
) {
	return adapter.update<CompanyRecord>({
		model: "crmCompany",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { ...input, updatedAt: new Date() },
	});
}
export async function deleteCompany(adapter: Adapter, id: string) {
	for (const model of ["crmContact", "crmDeal"]) {
		await adapter.updateMany({
			model,
			where: [{ field: "companyId", value: id, operator: "eq" }],
			update: { companyId: null, updatedAt: new Date() },
		});
	}
	await adapter.delete({
		model: "crmCompany",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export async function createPipeline(
	adapter: Adapter,
	input: DeepReadonly<z.output<typeof createPipelineSchema>>,
) {
	const board = await findOrCreateKanbanBoard(
		adapter,
		input.slug ?? `crm-${crypto.randomUUID()}`,
		input.name,
		[...input.stages],
	);
	await adapter.create({ model: "crmPipeline", data: { boardId: board.id } });
	return (await getPipeline(adapter, board.id))!;
}
export async function createDeal(
	adapter: Adapter,
	input: DeepReadonly<z.output<typeof createDealSchema>>,
) {
	const task = await createKanbanTask(adapter, {
		title: input.title,
		columnId: input.stage,
	});
	try {
		return await adapter.create<DealRecord>({
			model: "crmDeal",
			data: {
				taskId: task.id,
				value: input.value,
				currency: input.currency,
				contactId: input.contactId,
				companyId: input.companyId,
				closeDate: input.closeDate ? new Date(input.closeDate) : null,
				status: input.status,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	} catch (error) {
		await adapter.delete({
			model: "kanbanTask",
			where: [{ field: "id", value: task.id, operator: "eq" }],
		});
		throw error;
	}
}
export async function updateDeal(
	adapter: Adapter,
	id: string,
	taskId: string,
	input: DeepReadonly<z.output<typeof updateDealSchema>>,
) {
	if (input.title !== undefined)
		await adapter.update({
			model: "kanbanTask",
			where: [{ field: "id", value: taskId, operator: "eq" }],
			update: { title: input.title, updatedAt: new Date() },
		});
	const { title: _title, closeDate, ...fields } = input;
	return adapter.update<DealRecord>({
		model: "crmDeal",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			...fields,
			...(closeDate !== undefined
				? { closeDate: closeDate ? new Date(closeDate) : null }
				: {}),
			updatedAt: new Date(),
		},
	});
}
export async function moveDeal(
	adapter: Adapter,
	taskId: string,
	stage: string,
	order?: number,
) {
	await adapter.update({
		model: "kanbanTask",
		where: [{ field: "id", value: taskId, operator: "eq" }],
		update: {
			columnId: stage,
			...(order !== undefined ? { order } : {}),
			updatedAt: new Date(),
		},
	});
}
export async function deleteDeal(adapter: Adapter, id: string, taskId: string) {
	await adapter.deleteMany({
		model: "crmActivity",
		where: [{ field: "dealId", value: id, operator: "eq" }],
	});
	await adapter.delete({
		model: "crmDeal",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	await adapter.delete({
		model: "kanbanTask",
		where: [{ field: "id", value: taskId, operator: "eq" }],
	});
}
export function logActivity(
	adapter: Adapter,
	input: DeepReadonly<z.output<typeof createActivitySchema>>,
) {
	return adapter.create<ActivityRecord>({
		model: "crmActivity",
		data: {
			...input,
			dueAt: input.dueAt ? new Date(input.dueAt) : null,
			completedAt: null,
			remindedAt: null,
			createdAt: new Date(),
		},
	});
}
export function updateActivity(
	adapter: Adapter,
	id: string,
	input: DeepReadonly<z.output<typeof updateActivitySchema>>,
) {
	const { dueAt, completedAt, ...fields } = input;
	return adapter.update<ActivityRecord>({
		model: "crmActivity",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: {
			...fields,
			...(dueAt !== undefined
				? { dueAt: dueAt ? new Date(dueAt) : null, remindedAt: null }
				: {}),
			...(completedAt !== undefined
				? { completedAt: completedAt ? new Date(completedAt) : null }
				: {}),
		},
	});
}
export async function deleteActivity(adapter: Adapter, id: string) {
	await adapter.delete({
		model: "crmActivity",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
