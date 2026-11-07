import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { crmSchema } from "../db";
import * as schemas from "../schemas";
import type { CrmPluginHooks, CrmMergeRelation } from "../types";
import { createCrmOperations } from "./operations";
/** CRM lifecycle configuration. Shared API and authorization settings belong to the stack. */
export interface CrmBackendOptions {
	/** Post-authorization lifecycle hooks and follow-up notification delivery. */ hooks?: CrmPluginHooks;
	/** Application-owned scalar foreign keys repointed in the isolated merge transaction. */
	mergeRelations?: CrmMergeRelation[];
}
/** Private contacts, Kanban-backed deals and activity tracking. Requires the Kanban backend plugin. */
export const crmBackendPlugin = (options: CrmBackendOptions = {}) =>
	defineBackendPlugin({
		id: "crm",
		dbPlugin: crmSchema,
		operations: (adapter, context) => {
			if (!context?.auth) throw new Error("CRM requires stack authorization");
			if (
				!Object.values(context?.plugins ?? {}).some(
					(plugin) => plugin.id === "kanban",
				)
			)
				throw new Error("CRM requires the Kanban backend plugin");
			for (const relation of options.mergeRelations ?? []) {
				if (!relation.model || !relation.field || relation.field === "id")
					throw new Error(
						"CRM merge relations must name a scalar foreign key, not a primary key",
					);
			}
			return createCrmOperations(
				adapter,
				options.hooks,
				options.mergeRelations,
			);
		},
		routes: (_adapter, _context, operations) => ({
			listContactDuplicates: createEndpoint(
				"/crm/contacts/duplicates",
				{
					method: "GET",
					query: schemas.listDuplicatesSchema,
					requireRequest: true,
				},
				operations.listContactDuplicates.route((ctx) => ctx.query),
			),
			listCompanyDuplicates: createEndpoint(
				"/crm/companies/duplicates",
				{
					method: "GET",
					query: schemas.listDuplicatesSchema,
					requireRequest: true,
				},
				operations.listCompanyDuplicates.route((ctx) => ctx.query),
			),
			previewContactMerge: createEndpoint(
				"/crm/contacts/merge-preview",
				{
					method: "POST",
					body: schemas.mergePreviewSchema,
					requireRequest: true,
				},
				operations.previewContactMerge.route((ctx) => ctx.body),
			),
			previewCompanyMerge: createEndpoint(
				"/crm/companies/merge-preview",
				{
					method: "POST",
					body: schemas.mergePreviewSchema,
					requireRequest: true,
				},
				operations.previewCompanyMerge.route((ctx) => ctx.body),
			),
			mergeContacts: createEndpoint(
				"/crm/contacts/merge",
				{ method: "POST", body: schemas.mergeSchema, requireRequest: true },
				operations.mergeContacts.route((ctx) => ctx.body),
			),
			mergeCompanies: createEndpoint(
				"/crm/companies/merge",
				{ method: "POST", body: schemas.mergeSchema, requireRequest: true },
				operations.mergeCompanies.route((ctx) => ctx.body),
			),
			listContacts: createEndpoint(
				"/crm/contacts",
				{
					method: "GET",
					query: schemas.listContactsSchema,
					requireRequest: true,
				},
				operations.listContacts.route((ctx) => ctx.query),
			),
			getContactById: createEndpoint(
				"/crm/contacts/:id",
				{ method: "GET", requireRequest: true },
				operations.getContactById.route((ctx) => ({ id: ctx.params.id })),
			),
			createContact: createEndpoint(
				"/crm/contacts",
				{
					method: "POST",
					body: schemas.createContactSchema,
					requireRequest: true,
				},
				operations.createContact.route((ctx) => ctx.body),
			),
			updateContact: createEndpoint(
				"/crm/contacts/:id",
				{
					method: "PUT",
					body: schemas.updateContactSchema,
					requireRequest: true,
				},
				operations.updateContact.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteContact: createEndpoint(
				"/crm/contacts/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteContact.route((ctx) => ({ id: ctx.params.id })),
			),
			listCompanies: createEndpoint(
				"/crm/companies",
				{
					method: "GET",
					query: schemas.listCompaniesSchema,
					requireRequest: true,
				},
				operations.listCompanies.route((ctx) => ctx.query),
			),
			getCompanyById: createEndpoint(
				"/crm/companies/:id",
				{ method: "GET", requireRequest: true },
				operations.getCompanyById.route((ctx) => ({ id: ctx.params.id })),
			),
			createCompany: createEndpoint(
				"/crm/companies",
				{
					method: "POST",
					body: schemas.createCompanySchema,
					requireRequest: true,
				},
				operations.createCompany.route((ctx) => ctx.body),
			),
			updateCompany: createEndpoint(
				"/crm/companies/:id",
				{
					method: "PUT",
					body: schemas.updateCompanySchema,
					requireRequest: true,
				},
				operations.updateCompany.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteCompany: createEndpoint(
				"/crm/companies/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteCompany.route((ctx) => ({ id: ctx.params.id })),
			),
			listDeals: createEndpoint(
				"/crm/deals",
				{ method: "GET", query: schemas.listDealsSchema, requireRequest: true },
				operations.listDeals.route((ctx) => ctx.query),
			),
			getDealById: createEndpoint(
				"/crm/deals/:id",
				{ method: "GET", requireRequest: true },
				operations.getDealById.route((ctx) => ({ id: ctx.params.id })),
			),
			createDeal: createEndpoint(
				"/crm/deals",
				{
					method: "POST",
					body: schemas.createDealSchema,
					requireRequest: true,
				},
				operations.createDeal.route((ctx) => ctx.body),
			),
			updateDeal: createEndpoint(
				"/crm/deals/:id",
				{ method: "PUT", body: schemas.updateDealSchema, requireRequest: true },
				operations.updateDeal.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteDeal: createEndpoint(
				"/crm/deals/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteDeal.route((ctx) => ({ id: ctx.params.id })),
			),
			listPipelines: createEndpoint(
				"/crm/pipelines",
				{
					method: "GET",
					query: schemas.paginationSchema,
					requireRequest: true,
				},
				operations.listPipelines.route((ctx) => ctx.query),
			),
			getPipeline: createEndpoint(
				"/crm/pipelines/:id",
				{ method: "GET", requireRequest: true },
				operations.getPipeline.route((ctx) => ({ id: ctx.params.id })),
			),
			createPipeline: createEndpoint(
				"/crm/pipelines",
				{
					method: "POST",
					body: schemas.createPipelineSchema,
					requireRequest: true,
				},
				operations.createPipeline.route((ctx) => ctx.body),
			),
			moveDeal: createEndpoint(
				"/crm/deals/:id/move",
				{ method: "POST", body: schemas.moveDealSchema, requireRequest: true },
				operations.moveDeal.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			listActivities: createEndpoint(
				"/crm/activities",
				{
					method: "GET",
					query: schemas.listActivitiesSchema,
					requireRequest: true,
				},
				operations.listActivities.route((ctx) => ctx.query),
			),
			logActivity: createEndpoint(
				"/crm/activities",
				{
					method: "POST",
					body: schemas.createActivitySchema,
					requireRequest: true,
				},
				operations.logActivity.route((ctx) => ctx.body),
			),
			updateActivity: createEndpoint(
				"/crm/activities/:id",
				{
					method: "PUT",
					body: schemas.updateActivitySchema,
					requireRequest: true,
				},
				operations.updateActivity.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteActivity: createEndpoint(
				"/crm/activities/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteActivity.route((ctx) => ({ id: ctx.params.id })),
			),
			sendDueReminders: createEndpoint(
				"/crm/reminders/send",
				{ method: "POST", requireRequest: true },
				operations.sendDueReminders.route(() => ({})),
			),
		}),
	});
export type CrmApiRouter = ReturnType<
	ReturnType<typeof crmBackendPlugin>["routes"]
>;
