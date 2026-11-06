import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { helpdeskPermissions as permissions } from "../permissions";
import * as schemas from "../schemas";
import type {
	HelpdeskSlaTargets,
	HelpdeskTicket,
	TicketRecord,
} from "../types";
import * as getters from "./getters";
import * as mutations from "./mutations";
import {
	serializeCannedReply,
	serializeCustomerTicket,
	serializeTicket,
} from "./serializers";
/** Helpdesk configuration. SLA targets are elapsed minutes from ticket creation, up to ten years (5,256,000 minutes). */
export type HelpdeskBackendOptions = {
	slaTargets?: Partial<HelpdeskSlaTargets>;
	/** Optional system integrations, invoked after ticket persistence succeeds. */
	hooks?: {
		onAfterCreateTicket?: (
			ticket: HelpdeskTicket,
			context: { request?: Request },
		) => void | Promise<void>;
		onAfterResolveTicket?: (
			ticket: HelpdeskTicket,
			context: { request?: Request },
		) => void | Promise<void>;
	};
};
const fail = (status: number, message: string): never => {
	throw new OperationHttpError(status, message, "HELPDESK_ERROR");
};
const trustedCustomer = { customerId: z.string().min(1).max(200).optional() };
const customerCreateInput = schemas.createTicketSchema.extend(trustedCustomer);
const customerListInput = schemas.listTicketsSchema.extend(trustedCustomer);
const customerIdInput = schemas.idSchema.extend(trustedCustomer);
function customerId(context: {
	identity: { id: string } | null;
	request?: Request;
	input: { readonly customerId?: string };
}) {
	if (context.identity) {
		if (!context.identity.id)
			return fail(401, "Sign in to view your support tickets");
		return context.identity.id;
	}
	if (context.request) return fail(401, "Sign in to view your support tickets");
	return (
		context.input.customerId ??
		fail(400, "Trusted customer calls require customerId")
	);
}
async function requireTicket(adapter: getters.HelpdeskDataAdapter, id: string) {
	return (
		(await getters.getTicketRecord(adapter, id)) ??
		fail(404, "Ticket not found")
	);
}
function ownership(ticket: TicketRecord, id: string) {
	if (ticket.customerId !== id) fail(404, "Ticket not found");
}
/** Validated operation inventory shared by HTTP, request callers and trusted jobs. */
export function createHelpdeskOperations(
	adapter: Adapter,
	options: HelpdeskBackendOptions,
) {
	const slaTargets = z
		.object({
			low: z.number().positive().finite().max(5_256_000),
			medium: z.number().positive().finite().max(5_256_000),
			high: z.number().positive().finite().max(5_256_000),
			urgent: z.number().positive().finite().max(5_256_000),
		})
		.parse({
			low: 2880,
			medium: 1440,
			high: 240,
			urgent: 60,
			...options.slaTargets,
		});
	const facts = async ({ input }: { input: { readonly id: string } }) => {
		const ticket = await requireTicket(adapter, input.id);
		return { ticketId: ticket.id, customerId: ticket.customerId };
	};
	return {
		listCustomerTickets: defineOperation({
			input: customerListInput,
			permission: permissions.customerTicket.list,
			facts: () => undefined,
			execute: (context) =>
				getters.listCustomerTickets(
					adapter,
					context.input,
					customerId(context),
				),
		}),
		createTicket: defineOperation({
			input: customerCreateInput,
			permission: permissions.customerTicket.create,
			facts: () => undefined,
			execute: (context) => {
				const owner = customerId(context);
				return mutations.withHelpdeskTransaction(adapter, async (tx) => {
					const now = new Date();
					const input = context.input;
					const ticket = await mutations.createTicketRecord(tx, {
						subject: input.subject,
						customerId: owner,
						requesterEmail: input.requesterEmail ?? null,
						status: "open",
						priority: input.priority,
						assigneeId: null,
						lockVersion: crypto.randomUUID(),
						slaDueAt: new Date(
							now.getTime() + slaTargets[input.priority] * 60_000,
						),
						firstRespondedAt: null,
						resolvedAt: null,
						createdAt: now,
						updatedAt: now,
					});
					await mutations.createMessageRecord(tx, {
						ticketId: ticket.id,
						body: input.body,
						authorId: owner,
						authorType: "customer",
						isInternalNote: false,
						createdAt: now,
					});
					return serializeCustomerTicket(ticket);
				});
			},
			after: async ({ result, request }) => {
				if (options.hooks?.onAfterCreateTicket)
					await options.hooks.onAfterCreateTicket(
						serializeTicket(await requireTicket(adapter, result.id)),
						{ request },
					);
			},
		}),
		getCustomerTicket: defineOperation({
			input: customerIdInput,
			permission: permissions.customerTicket.read,
			facts,
			execute: async (context) =>
				(await getters.getCustomerTicket(
					adapter,
					context.input.id,
					customerId(context),
				)) ?? fail(404, "Ticket not found"),
		}),
		replyToTicket: defineOperation({
			input: customerIdInput.extend(schemas.customerReplySchema.shape),
			permission: permissions.customerTicket.reply,
			facts,
			additionalPermissions: ({ facts }) => [
				permissions.customerTicket.read(facts),
			],
			execute: (context) => {
				const owner = customerId(context);
				return mutations.withHelpdeskTransaction(adapter, async (tx) => {
					const ticket = await mutations.lockTicket(tx, context.input.id);
					ownership(ticket, owner);
					if (ticket.status === "closed")
						fail(409, "Closed tickets cannot receive replies");
					const now = new Date();
					await mutations.createMessageRecord(tx, {
						ticketId: ticket.id,
						body: context.input.body,
						authorId: owner,
						authorType: "customer",
						isInternalNote: false,
						createdAt: now,
					});
					await mutations.updateTicketRecord(tx, ticket.id, {
						status: "open",
						resolvedAt: null,
						updatedAt: now,
					});
					return (await getters.getCustomerTicket(tx, ticket.id, owner))!;
				});
			},
		}),
		listAgentTickets: defineOperation({
			input: schemas.listTicketsSchema,
			permission: permissions.ticket.list,
			facts: () => undefined,
			execute: ({ input }) => getters.listAgentTickets(adapter, input),
		}),
		getAgentTicket: defineOperation({
			input: schemas.idSchema,
			permission: permissions.ticket.read,
			facts,
			execute: async ({ input }) =>
				(await getters.getAgentTicket(adapter, input.id)) ??
				fail(404, "Ticket not found"),
		}),
		updateTicket: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.updateTicketSchema }),
			permission: permissions.ticket.update,
			facts,
			execute: async ({ input, request }) => {
				const result = await mutations.withHelpdeskTransaction(
					adapter,
					async (tx) => {
						const ticket = await mutations.lockTicket(tx, input.id);
						const data = input.data;
						const now = new Date();
						const status = data.status ?? ticket.status;
						const resolvedAt =
							status === "resolved" || status === "closed"
								? (ticket.resolvedAt ?? now)
								: null;
						const row = await mutations.updateTicketRecord(tx, ticket.id, {
							...data,
							resolvedAt,
							...(data.priority
								? {
										slaDueAt: new Date(
											new Date(ticket.createdAt).getTime() +
												slaTargets[data.priority] * 60_000,
										),
									}
								: {}),
							updatedAt: now,
						});
						return {
							ticket: serializeTicket(row!),
							justResolved: !ticket.resolvedAt && !!resolvedAt,
						};
					},
				);
				if (result.justResolved)
					await options.hooks?.onAfterResolveTicket?.(result.ticket, {
						request,
					});
				return result.ticket;
			},
		}),
		replyAsAgent: defineOperation({
			input: schemas.idSchema
				.extend(schemas.agentReplySchema.shape)
				.extend({ authorId: z.string().min(1).max(200).optional() }),
			permission: permissions.ticket.reply,
			facts,
			additionalPermissions: ({ facts }) => [permissions.ticket.read(facts)],
			execute: ({ input, identity }) =>
				mutations.withHelpdeskTransaction(adapter, async (tx) => {
					const ticket = await mutations.lockTicket(tx, input.id);
					if (ticket.status === "closed")
						fail(409, "Closed tickets cannot receive replies");
					const now = new Date();
					await mutations.createMessageRecord(tx, {
						ticketId: ticket.id,
						body: input.body,
						authorId: identity?.id ?? input.authorId ?? "system",
						authorType: "agent",
						isInternalNote: input.isInternalNote,
						createdAt: now,
					});
					if (!input.isInternalNote)
						await mutations.updateTicketRecord(tx, ticket.id, {
							firstRespondedAt: ticket.firstRespondedAt ?? now,
							updatedAt: now,
						});
					return (await getters.getAgentTicket(tx, ticket.id))!;
				}),
		}),
		listCannedReplies: defineOperation({
			input: schemas.paginationSchema,
			permission: permissions.cannedReply.list,
			facts: () => undefined,
			execute: ({ input }) => getters.listCannedReplies(adapter, input),
		}),
		createCannedReply: defineOperation({
			input: schemas.cannedReplySchema,
			permission: permissions.cannedReply.create,
			facts: () => undefined,
			execute: async ({ input }) =>
				serializeCannedReply(await mutations.createCannedReply(adapter, input)),
		}),
		updateCannedReply: defineOperation({
			input: schemas.idSchema.extend({ data: schemas.cannedReplySchema }),
			permission: permissions.cannedReply.update,
			facts: async ({ input }) => ({
				id: (
					(await getters.getCannedReplyRecord(adapter, input.id)) ??
					fail(404, "Canned reply not found")
				).id,
			}),
			execute: async ({ input }) =>
				serializeCannedReply(
					(await mutations.updateCannedReply(adapter, input.id, input.data)) ??
						fail(404, "Canned reply not found"),
				),
		}),
		deleteCannedReply: defineOperation({
			input: schemas.idSchema,
			permission: permissions.cannedReply.delete,
			facts: async ({ input }) => ({
				id: (
					(await getters.getCannedReplyRecord(adapter, input.id)) ??
					fail(404, "Canned reply not found")
				).id,
			}),
			execute: async ({ input }) => {
				await mutations.deleteCannedReply(adapter, input.id);
				return { success: true as const };
			},
		}),
	};
}
