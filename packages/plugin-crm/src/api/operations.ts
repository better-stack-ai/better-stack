import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { crmPermissions as permissions } from "../permissions";
import * as schemas from "../schemas";
import type { ActivityRecord, CrmPluginHooks } from "../types";
import type { Column } from "@btst/plugin-kanban/types";
import * as getters from "./getters";
import * as mutations from "./mutations";
import {
	serializeContact,
	serializeCompany,
	serializeActivity,
} from "./serializers";
const fail = (status: number, message: string): never => {
	throw new OperationHttpError(status, message, "CRM_ERROR");
};
async function requireContact(adapter: Adapter, id: string) {
	return (
		(await getters.getContactById(adapter, id)) ??
		fail(404, "Contact not found")
	);
}
async function requireCompany(adapter: Adapter, id: string) {
	return (
		(await getters.getCompanyById(adapter, id)) ??
		fail(404, "Company not found")
	);
}
async function requireDeal(adapter: Adapter, id: string) {
	return (
		(await getters.getDealById(adapter, id)) ?? fail(404, "Deal not found")
	);
}
async function requireActivity(adapter: Adapter, id: string) {
	return (
		(await getters.getActivityRecord(adapter, id)) ??
		fail(404, "Activity not found")
	);
}
async function validateLinks(
	adapter: Adapter,
	input: {
		readonly contactId?: string | null;
		readonly companyId?: string | null;
		readonly dealId?: string | null;
	},
) {
	if (input.contactId) await requireContact(adapter, input.contactId);
	if (input.companyId) await requireCompany(adapter, input.companyId);
	if (input.dealId) await requireDeal(adapter, input.dealId);
}
async function validateStage(
	adapter: Adapter,
	pipelineId: string,
	stage: string,
) {
	if (!(await getters.getPipeline(adapter, pipelineId)))
		fail(404, "Pipeline not found");
	const column = await adapter.findOne<Column>({
		model: "kanbanColumn",
		where: [{ field: "id", value: stage, operator: "eq" }],
	});
	if (!column || column.boardId !== pipelineId)
		fail(400, "Stage does not belong to this pipeline");
}
async function dealFacts(adapter: Adapter, id: string) {
	const deal = await requireDeal(adapter, id);
	return {
		id: deal.id,
		pipelineId: deal.pipelineId,
		contactId: deal.contactId ?? null,
		companyId: deal.companyId ?? null,
	};
}
/** One validated operation inventory for HTTP routes, request callers and trusted jobs. */
export function createCrmOperations(adapter: Adapter, hooks?: CrmPluginHooks) {
	return {
		listContacts: defineOperation({
			input: schemas.listContactsSchema,
			permission: permissions.contact.read,
			facts: () => undefined,
			execute: ({ input }) => getters.listContacts(adapter, input),
		}),
		getContactById: defineOperation({
			input: schemas.idSchema,
			permission: permissions.contact.read,
			facts: () => undefined,
			execute: ({ input }) => requireContact(adapter, input.id),
		}),
		createContact: defineOperation({
			input: schemas.createContactSchema,
			permission: permissions.contact.create,
			facts: () => undefined,
			before: ({ input, request }) =>
				hooks?.onBeforeCreateContact?.(input, { request }),
			execute: async ({ input }) => {
				await validateLinks(adapter, input);
				return serializeContact(await mutations.createContact(adapter, input));
			},
			after: ({ result, request }) =>
				hooks?.onAfterCreateContact?.(result, { request }),
		}),
		updateContact: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.updateContactSchema }),
			permission: permissions.contact.update,
			facts: async ({ input }) => ({
				id: (await requireContact(adapter, input.id)).id,
			}),
			before: ({ input, request }) =>
				hooks?.onBeforeUpdateContact?.(input, { request }),
			execute: async ({ input }) => {
				await validateLinks(adapter, input.data);
				const row = await mutations.updateContact(
					adapter,
					input.id,
					input.data,
				);
				return serializeContact(row ?? fail(404, "Contact not found"));
			},
			after: ({ result, request }) =>
				hooks?.onAfterUpdateContact?.(result, { request }),
		}),
		deleteContact: defineOperation({
			input: schemas.idSchema,
			permission: permissions.contact.delete,
			facts: async ({ input }) => ({
				id: (await requireContact(adapter, input.id)).id,
			}),
			before: async ({ input, request }) =>
				hooks?.onBeforeDeleteContact?.(
					await requireContact(adapter, input.id),
					{ request },
				),
			execute: async ({ input }) => {
				await mutations.deleteContact(adapter, input.id);
				return { success: true as const };
			},
			after: ({ input, request }) =>
				hooks?.onAfterDeleteContact?.({ id: input.id }, { request }),
		}),
		listCompanies: defineOperation({
			input: schemas.listCompaniesSchema,
			permission: permissions.company.read,
			facts: () => undefined,
			execute: ({ input }) => getters.listCompanies(adapter, input),
		}),
		getCompanyById: defineOperation({
			input: schemas.idSchema,
			permission: permissions.company.read,
			facts: () => undefined,
			execute: ({ input }) => requireCompany(adapter, input.id),
		}),
		createCompany: defineOperation({
			input: schemas.createCompanySchema,
			permission: permissions.company.create,
			facts: () => undefined,
			before: ({ input, request }) =>
				hooks?.onBeforeCreateCompany?.(input, { request }),
			execute: async ({ input }) =>
				serializeCompany(await mutations.createCompany(adapter, input)),
			after: ({ result, request }) =>
				hooks?.onAfterCreateCompany?.(result, { request }),
		}),
		updateCompany: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.updateCompanySchema }),
			permission: permissions.company.update,
			facts: async ({ input }) => ({
				id: (await requireCompany(adapter, input.id)).id,
			}),
			before: ({ input, request }) =>
				hooks?.onBeforeUpdateCompany?.(input, { request }),
			execute: async ({ input }) =>
				serializeCompany(
					(await mutations.updateCompany(adapter, input.id, input.data)) ??
						fail(404, "Company not found"),
				),
			after: ({ result, request }) =>
				hooks?.onAfterUpdateCompany?.(result, { request }),
		}),
		deleteCompany: defineOperation({
			input: schemas.idSchema,
			permission: permissions.company.delete,
			facts: async ({ input }) => ({
				id: (await requireCompany(adapter, input.id)).id,
			}),
			before: async ({ input, request }) =>
				hooks?.onBeforeDeleteCompany?.(
					await requireCompany(adapter, input.id),
					{ request },
				),
			execute: async ({ input }) => {
				await mutations.deleteCompany(adapter, input.id);
				return { success: true as const };
			},
			after: ({ input, request }) =>
				hooks?.onAfterDeleteCompany?.({ id: input.id }, { request }),
		}),
		listPipelines: defineOperation({
			input: schemas.paginationSchema,
			permission: permissions.pipeline.read,
			facts: () => undefined,
			additionalPermissions: () => [permissions.deal.read()],
			execute: ({ input }) => getters.listPipelines(adapter, input),
		}),
		getPipeline: defineOperation({
			input: schemas.idSchema,
			permission: permissions.pipeline.read,
			facts: () => undefined,
			additionalPermissions: () => [permissions.deal.read()],
			execute: async ({ input }) =>
				(await getters.getPipeline(adapter, input.id)) ??
				fail(404, "Pipeline not found"),
		}),
		createPipeline: defineOperation({
			input: schemas.createPipelineSchema,
			permission: permissions.pipeline.create,
			facts: () => undefined,
			execute: async ({ input }) => {
				if (
					input.slug &&
					(await adapter.findOne({
						model: "kanbanBoard",
						where: [{ field: "slug", value: input.slug, operator: "eq" }],
					}))
				)
					fail(409, "This pipeline slug is already in use");
				return mutations.createPipeline(adapter, input);
			},
		}),
		listDeals: defineOperation({
			input: schemas.listDealsSchema,
			permission: permissions.deal.read,
			facts: () => undefined,
			execute: ({ input }) => getters.listDeals(adapter, input),
		}),
		getDealById: defineOperation({
			input: schemas.idSchema,
			permission: permissions.deal.read,
			facts: () => undefined,
			execute: ({ input }) => requireDeal(adapter, input.id),
		}),
		createDeal: defineOperation({
			input: schemas.createDealSchema,
			permission: permissions.deal.create,
			facts: async ({ input }) => {
				await validateStage(adapter, input.pipelineId, input.stage);
				await validateLinks(adapter, input);
				return {
					pipelineId: input.pipelineId,
					stage: input.stage,
					contactId: input.contactId ?? null,
					companyId: input.companyId ?? null,
				};
			},
			before: ({ input, request }) =>
				hooks?.onBeforeCreateDeal?.(input, { request }),
			execute: async ({ input }) => {
				const row = await mutations.createDeal(adapter, input);
				return requireDeal(adapter, row.id);
			},
			after: ({ result, request }) =>
				hooks?.onAfterCreateDeal?.(result, { request }),
		}),
		updateDeal: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.updateDealSchema }),
			permission: permissions.deal.update,
			facts: ({ input }) => dealFacts(adapter, input.id),
			before: ({ input, request }) =>
				hooks?.onBeforeUpdateDeal?.(input, { request }),
			execute: async ({ input }) => {
				await validateLinks(adapter, input.data);
				const deal = await requireDeal(adapter, input.id);
				await mutations.updateDeal(adapter, input.id, deal.taskId, input.data);
				return requireDeal(adapter, input.id);
			},
			after: ({ result, request }) =>
				hooks?.onAfterUpdateDeal?.(result, { request }),
		}),
		deleteDeal: defineOperation({
			input: schemas.idSchema,
			permission: permissions.deal.delete,
			facts: ({ input }) => dealFacts(adapter, input.id),
			before: async ({ input, request }) =>
				hooks?.onBeforeDeleteDeal?.(await requireDeal(adapter, input.id), {
					request,
				}),
			execute: async ({ input }) => {
				const deal = await requireDeal(adapter, input.id);
				await mutations.deleteDeal(adapter, input.id, deal.taskId);
				return { success: true as const };
			},
			after: ({ input, request }) =>
				hooks?.onAfterDeleteDeal?.({ id: input.id }, { request }),
		}),
		moveDeal: defineOperation({
			input: schemas.idSchema.extend(schemas.moveDealSchema.shape),
			permission: permissions.deal.move,
			facts: async ({ input }) => {
				const facts = await dealFacts(adapter, input.id);
				await validateStage(adapter, facts.pipelineId, input.stage);
				return { ...facts, targetStage: input.stage };
			},
			execute: async ({ input }) => {
				const deal = await requireDeal(adapter, input.id);
				await validateStage(adapter, deal.pipelineId, input.stage);
				await mutations.moveDeal(
					adapter,
					deal.taskId,
					input.stage,
					input.order,
				);
				return requireDeal(adapter, input.id);
			},
			after: ({ result, request }) =>
				hooks?.onAfterMoveDeal?.(result, { request }),
		}),
		listActivities: defineOperation({
			input: schemas.listActivitiesSchema,
			permission: permissions.activity.read,
			facts: () => undefined,
			execute: ({ input }) => getters.listActivities(adapter, input),
		}),
		logActivity: defineOperation({
			input: schemas.createActivitySchema,
			permission: permissions.activity.create,
			facts: async ({ input }) => {
				await validateLinks(adapter, input);
				return {
					contactId: input.contactId ?? null,
					dealId: input.dealId ?? null,
				};
			},
			before: ({ input, request }) =>
				hooks?.onBeforeLogActivity?.(input, { request }),
			execute: async ({ input }) =>
				serializeActivity(await mutations.logActivity(adapter, input)),
			after: ({ result, request }) =>
				hooks?.onAfterLogActivity?.(result, { request }),
		}),
		updateActivity: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.updateActivitySchema }),
			permission: permissions.activity.update,
			facts: async ({ input }) => ({
				id: (await requireActivity(adapter, input.id)).id,
			}),
			execute: async ({ input }) =>
				serializeActivity(
					(await mutations.updateActivity(adapter, input.id, input.data)) ??
						fail(404, "Activity not found"),
				),
			after: ({ result, request }) =>
				hooks?.onAfterUpdateActivity?.(result, { request }),
		}),
		deleteActivity: defineOperation({
			input: schemas.idSchema,
			permission: permissions.activity.delete,
			facts: async ({ input }) => ({
				id: (await requireActivity(adapter, input.id)).id,
			}),
			execute: async ({ input }) => {
				await mutations.deleteActivity(adapter, input.id);
				return { success: true as const };
			},
		}),
		sendDueReminders: defineOperation({
			input: z.object({}),
			permission: permissions.reminder.run,
			facts: () => undefined,
			execute: async ({ request }) => {
				let sent = 0;
				if (!hooks?.onActivityReminder) return { sent };
				const due = (
					await getters.getCrmRows<ActivityRecord>(adapter, "crmActivity")
				).filter(
					(row) =>
						row.dueAt &&
						!row.completedAt &&
						!row.remindedAt &&
						new Date(row.dueAt).getTime() <= Date.now(),
				);
				for (const activity of due) {
					const claimedAt = new Date();
					const claimed = await adapter.incrementOne<ActivityRecord>({
						model: "crmActivity",
						where: [
							{ field: "id", value: activity.id, operator: "eq" },
							{ field: "dueAt", value: activity.dueAt!, operator: "eq" },
							{ field: "completedAt", value: null, operator: "eq" },
							{ field: "remindedAt", value: null, operator: "eq" },
						],
						increment: {},
						set: { remindedAt: claimedAt },
					});
					if (!claimed) continue;
					try {
						await hooks.onActivityReminder(serializeActivity(claimed), {
							request,
						});
						sent++;
					} catch (error) {
						await adapter.incrementOne({
							model: "crmActivity",
							where: [
								{ field: "id", value: activity.id, operator: "eq" },
								{ field: "remindedAt", value: claimedAt, operator: "eq" },
							],
							increment: {},
							set: { remindedAt: null },
						});
						throw error;
					}
				}
				return { sent };
			},
		}),
	};
}
