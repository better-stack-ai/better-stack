"use client";
import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { useQueryClient } from "@tanstack/react-query";
import { useResourceContext } from "@btst/stack/plugins/client/hooks";
import { createCrmQueryKeys } from "../../query-keys";
import { createResource } from "@btst/stack/plugins/client/hooks";
import {
	crmResources,
	type CrmListParams,
	type CrmOwnerFilter,
} from "../../query-keys";
import { CRM_PLUGIN_ID } from "../constants";
export const crm = createResource({
	plugin: CRM_PLUGIN_ID,
	resources: crmResources,
});
function useCrmIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}
/** Fetch CRM contacts scoped to the current identity. */
export const useContacts = (params: CrmListParams = {}) =>
	crm.crmContacts.list.useSuspense([params, useCrmIdentity()]);
/** Fetch a CRM contact. */
export const useContact = (id: string) =>
	crm.crmContacts.detail.useSuspense([id, useCrmIdentity()]);
export const useCreateContact = () => crm.crmContacts.create.use();
export const useUpdateContact = () => crm.crmContacts.update.use();
export const useDeleteContact = () => crm.crmContacts.delete.use();
/** Fetch CRM companies scoped to the current identity. */
export const useCompanies = (params: CrmListParams = {}) =>
	crm.crmCompanies.list.useSuspense([params, useCrmIdentity()]);
/** Fetch a CRM company. */
export const useCompany = (id: string) =>
	crm.crmCompanies.detail.useSuspense([id, useCrmIdentity()]);
export const useCreateCompany = () => crm.crmCompanies.create.use();
export const useUpdateCompany = () => crm.crmCompanies.update.use();
export const useDeleteCompany = () => crm.crmCompanies.delete.use();
/** Fetch assignable staff from the application directory. */
export const useDealOwners = () =>
	crm.crmOwners.list.useSuspense([useCrmIdentity()]);
/** Assign or clear ownership using the observed owner as a concurrency guard. */
export const useAssignDealOwner = () => crm.crmDeals.assignOwner.use();
/** Fetch CRM deals scoped to the current identity. */
export const useDeals = (params: CrmListParams = {}) =>
	crm.crmDeals.list.useSuspense([params, useCrmIdentity()]);
/** Fetch a CRM deal. */
export const useDeal = (id: string) =>
	crm.crmDeals.detail.useSuspense([id, useCrmIdentity()]);
export const useCreateDeal = () => crm.crmDeals.create.use();
export const useUpdateDeal = () => crm.crmDeals.update.use();
export const useDeleteDeal = () => crm.crmDeals.delete.use();
/** Fetch CRM activities scoped to the current identity. */
export const useActivities = (params: CrmListParams = {}) =>
	crm.crmActivities.list.useSuspense([params, useCrmIdentity()]);
export const useCreateActivity = () => crm.crmActivities.create.use();
export const useUpdateActivity = () => crm.crmActivities.update.use();
export const useDeleteActivity = () => crm.crmActivities.delete.use();
/** Fetch CRM pipelines scoped to the current identity. */
export const usePipelines = (params: CrmListParams = {}) =>
	crm.crmPipelines.list.useSuspense([params, useCrmIdentity()]);
/** Fetch a CRM pipeline. */
export const usePipeline = (id: string, filters?: CrmOwnerFilter) =>
	crm.crmPipelines.detail.useSuspense([id, useCrmIdentity(), filters]);
export const useCreatePipeline = () => crm.crmPipelines.create.use();
export const useMoveDeal = () => crm.crmDeals.move.use();

/** Run an authorized contact search from a page AI tool using the same resource query. */
export function useSearchContacts() {
	const context = useResourceContext(CRM_PLUGIN_ID);
	const queryClient = useQueryClient(context.queryClient);
	const identity = useCrmIdentity();
	return (params: CrmListParams) =>
		queryClient.fetchQuery({
			...createCrmQueryKeys(context.client, context.headers).crmContacts.list(
				params,
				identity,
			),
			staleTime: 0,
		});
}
