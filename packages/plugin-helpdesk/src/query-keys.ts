import type { StackIdentity } from "@btst/stack/context";
import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	CustomerTicket,
	CustomerTicketDetail,
	HelpdeskTicket,
	HelpdeskTicketDetail,
	HelpdeskCannedReply,
	HelpdeskListParams,
	TicketPriority,
	TicketStatus,
} from "./types";

/** Partition protected query data by the current identity. */
export type HelpdeskIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;
/** Customer ticket submission. */
export interface CreateTicketInput {
	requesterEmail?: string;
	subject: string;
	body: string;
	priority?: TicketPriority;
}
/** Agent-editable ticket fields. */
export interface UpdateTicketInput {
	status?: TicketStatus;
	priority?: TicketPriority;
	assigneeId?: string | null;
}
/** Public reply or agent-only note. */
export interface TicketReplyInput {
	id: string;
	body: string;
	isInternalNote?: boolean;
}

export const helpdeskResources = {
	helpdeskCustomerTickets: {
		queries: {
			list: {
				path: "/helpdesk/tickets",
				query: (
					params: HelpdeskListParams = {},
					_identity?: HelpdeskIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown) =>
					data as { items: CustomerTicket[]; total: number },
			},
			detail: {
				path: "/helpdesk/tickets/:id",
				params: (id: string, _identity?: HelpdeskIdentityPartition) => ({ id }),
				select: (data: unknown) => data as CustomerTicketDetail,
			},
		},
		mutations: {
			create: {
				path: "@post/helpdesk/tickets",
				method: "POST",
				input: (body: CreateTicketInput) => ({ body }),
				select: (data: unknown) => data as CustomerTicket,
				invalidates: ["helpdeskCustomerTickets", "helpdeskAgentTickets"],
				refresh: false,
			},
			reply: {
				path: "@post/helpdesk/tickets/:id/replies",
				method: "POST",
				input: ({ id, body }: { id: string; body: string }) => ({
					params: { id },
					body: { body },
				}),
				select: (data: unknown) => data as CustomerTicketDetail,
				invalidates: ["helpdeskCustomerTickets", "helpdeskAgentTickets"],
				refresh: false,
			},
		},
	},
	helpdeskAgentTickets: {
		queries: {
			list: {
				path: "/helpdesk/inbox",
				query: (
					params: HelpdeskListParams = {},
					_identity?: HelpdeskIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown) =>
					data as { items: HelpdeskTicket[]; total: number },
			},
			detail: {
				path: "/helpdesk/inbox/:id",
				params: (id: string, _identity?: HelpdeskIdentityPartition) => ({ id }),
				select: (data: unknown) => data as HelpdeskTicketDetail,
			},
		},
		mutations: {
			update: {
				path: "@put/helpdesk/inbox/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: UpdateTicketInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown) => data as HelpdeskTicket,
				invalidates: ["helpdeskAgentTickets", "helpdeskCustomerTickets"],
				refresh: false,
			},
			reply: {
				path: "@post/helpdesk/inbox/:id/replies",
				method: "POST",
				input: ({ id, body, isInternalNote = false }: TicketReplyInput) => ({
					params: { id },
					body: { body, isInternalNote },
				}),
				select: (data: unknown) => data as HelpdeskTicketDetail,
				invalidates: ["helpdeskAgentTickets", "helpdeskCustomerTickets"],
				refresh: false,
			},
		},
	},
	helpdeskCannedReplies: {
		queries: {
			list: {
				path: "/helpdesk/canned-replies",
				query: (
					params: { limit?: number; offset?: number } = {},
					_identity?: HelpdeskIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown) =>
					data as { items: HelpdeskCannedReply[]; total: number },
			},
		},
		mutations: {
			create: {
				path: "@post/helpdesk/canned-replies",
				method: "POST",
				input: (body: { title: string; body: string }) => ({ body }),
				invalidates: ["helpdeskCannedReplies"],
				refresh: false,
			},
			update: {
				path: "@put/helpdesk/canned-replies/:id",
				method: "PUT",
				input: ({
					id,
					title,
					body,
				}: {
					id: string;
					title: string;
					body: string;
				}) => ({ params: { id }, body: { title, body } }),
				invalidates: ["helpdeskCannedReplies"],
				refresh: false,
			},
			delete: {
				path: "@delete/helpdesk/canned-replies/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["helpdeskCannedReplies"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

/** Query factory shared by SSR loaders and browser hooks. */
export function createHelpdeskQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, helpdeskResources, headers);
}
