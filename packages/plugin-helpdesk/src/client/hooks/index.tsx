"use client";

import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { helpdeskResources } from "../../query-keys";
import type { HelpdeskListParams } from "../../types";
import { HELPDESK_PLUGIN_ID } from "../constants";

const helpdesk = createResource({
	plugin: HELPDESK_PLUGIN_ID,
	resources: helpdeskResources,
});
function useHelpdeskIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}
/** Customer-scoped ticket list; never shares an agent query key. */
export const useCustomerTickets = (params: HelpdeskListParams = {}) =>
	helpdesk.helpdeskCustomerTickets.list.useSuspense([
		params,
		useHelpdeskIdentity(),
	]);
/** Customer-scoped conversation with internal messages excluded by the API. */
export const useCustomerTicket = (id: string) =>
	helpdesk.helpdeskCustomerTickets.detail.useSuspense([
		id,
		useHelpdeskIdentity(),
	]);
export const useCreateTicket = () =>
	helpdesk.helpdeskCustomerTickets.create.use();
export const useCustomerReply = () =>
	helpdesk.helpdeskCustomerTickets.reply.use();
/** Agent queue, partitioned by the current identity. */
export const useHelpdeskInbox = (params: HelpdeskListParams = {}) =>
	helpdesk.helpdeskAgentTickets.list.useSuspense([
		params,
		useHelpdeskIdentity(),
	]);
/** Full agent conversation including internal notes. */
export const useAgentTicket = (id: string) =>
	helpdesk.helpdeskAgentTickets.detail.useSuspense([id, useHelpdeskIdentity()]);
export const useUpdateTicket = () => helpdesk.helpdeskAgentTickets.update.use();
export const useAgentReply = () => helpdesk.helpdeskAgentTickets.reply.use();
/** Canned replies available to the current agent. */
export const useCannedReplies = (
	params: { limit?: number; offset?: number } = { limit: 25, offset: 0 },
) =>
	helpdesk.helpdeskCannedReplies.list.useSuspense([
		params,
		useHelpdeskIdentity(),
	]);
export const useCreateCannedReply = () =>
	helpdesk.helpdeskCannedReplies.create.use();
export const useUpdateCannedReply = () =>
	helpdesk.helpdeskCannedReplies.update.use();
export const useDeleteCannedReply = () =>
	helpdesk.helpdeskCannedReplies.delete.use();

export {
	useAttachmentTransport,
	useReplyAttachments,
} from "./attachment-hooks";
