import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	OperationHttpError,
	type DeepReadonly,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { helpdeskPermissions as permissions } from "../permissions";
import * as schemas from "../schemas";
import type {
	HelpdeskBusinessCalendar,
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
import { calculateSlaDeadline, createSlaPolicy, readSlaPolicy } from "./sla";
/** Message metadata supplied after the message transaction commits. */
export type HelpdeskMessageContext = {
	readonly authorType: "customer" | "agent";
	readonly isInternalNote: boolean;
};
/** Hooks run after authorized ticket/message transactions commit. */
export interface HelpdeskBackendHooks {
	onAfterCreateTicket?: (
		ticket: HelpdeskTicket,
		context: { request?: Request },
	) => void | Promise<void>;
	onAfterResolveTicket?: (
		ticket: HelpdeskTicket,
		context: { request?: Request },
	) => void | Promise<void>;
	onAfterUpdateTicket?: (
		ticket: DeepReadonly<HelpdeskTicket>,
		previous: DeepReadonly<HelpdeskTicket>,
	) => void | Promise<void>;
	onAfterCreateMessage?: (
		ticket: DeepReadonly<HelpdeskTicket>,
		message: HelpdeskMessageContext,
	) => void | Promise<void>;
}
/** Application-owned SLA policy. Targets are positive minutes, at most 5,256,000. */
export type HelpdeskBackendOptions = {
	/** First-response targets; elapsed minutes unless businessCalendar is supplied. */
	slaTargets?: Partial<HelpdeskSlaTargets>;
	/** Optional resolution targets; omitted priorities have no resolution deadline. */
	resolutionTargets?: Partial<HelpdeskSlaTargets>;
	/** Working hours and closed holidays; calculated deadlines must fit within 100 years. */
	businessCalendar?: HelpdeskBusinessCalendar;
	hooks?: HelpdeskBackendHooks;
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
function deadline(
	createdAt: Date,
	minutes: number,
	calendar?: HelpdeskBusinessCalendar,
) {
	try {
		return calculateSlaDeadline(new Date(createdAt), minutes, calendar);
	} catch (error) {
		if (error instanceof RangeError) return fail(400, error.message);
		throw error;
	}
}
/** Validated operation inventory shared by HTTP, request callers and trusted jobs. */
export function createHelpdeskOperations(
	adapter: Adapter,
	options: HelpdeskBackendOptions,
) {
	const previousTickets = new WeakMap<object, HelpdeskTicket>();
	const messageTickets = new WeakMap<object, HelpdeskTicket>();
	const policy = createSlaPolicy(options);
	const snapshot =
		options.businessCalendar !== undefined ||
		options.resolutionTargets !== undefined
			? JSON.stringify(policy)
			: null;
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
				const email = schemas.createTicketSchema.shape.requesterEmail.safeParse(
					context.request
						? context.identity?.email
						: context.input.requesterEmail,
				);
				const requesterEmail = email.success ? (email.data ?? null) : null;
				return mutations.withHelpdeskTransaction(adapter, async (tx) => {
					const now = new Date();
					const input = context.input;
					const ticket = await mutations.createTicketRecord(tx, {
						subject: input.subject,
						customerId: owner,
						requesterEmail,
						status: "open",
						priority: input.priority,
						assigneeId: null,
						lockVersion: crypto.randomUUID(),
						slaDueAt: deadline(
							now,
							policy.responseTargets[input.priority],
							policy.businessCalendar,
						),
						resolutionDueAt:
							policy.resolutionTargets?.[input.priority] !== undefined
								? deadline(
										now,
										policy.resolutionTargets[input.priority]!,
										policy.businessCalendar,
									)
								: null,
						slaPolicy: snapshot,
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
					const updated = await mutations.updateTicketRecord(tx, ticket.id, {
						status: "open",
						resolvedAt: null,
						updatedAt: now,
					});
					messageTickets.set(
						context.input,
						Object.freeze(serializeTicket(updated!)),
					);
					return (await getters.getCustomerTicket(tx, ticket.id, owner))!;
				});
			},
			after: async ({ input }) => {
				const ticket = messageTickets.get(input);
				messageTickets.delete(input);
				if (ticket)
					await options.hooks?.onAfterCreateMessage?.(
						ticket,
						Object.freeze({
							authorType: "customer",
							isInternalNote: false,
						}),
					);
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
			execute: ({ input }) =>
				mutations.withHelpdeskTransaction(adapter, async (tx) => {
					const ticket = await mutations.lockTicket(tx, input.id);
					previousTickets.set(input, Object.freeze(serializeTicket(ticket)));
					const data = input.data;
					const now = new Date();
					const status = data.status ?? ticket.status;
					const resolvedAt =
						status === "resolved" || status === "closed"
							? (ticket.resolvedAt ?? now)
							: null;
					const savedPolicy = ticket.slaPolicy
						? readSlaPolicy(ticket.slaPolicy)
						: null;
					const priority = data.priority;
					const deadlines: Partial<TicketRecord> = {};
					if (priority && (!savedPolicy || priority !== ticket.priority)) {
						if (!savedPolicy || !ticket.firstRespondedAt)
							deadlines.slaDueAt = deadline(
								ticket.createdAt,
								(savedPolicy ?? policy).responseTargets[priority],
								savedPolicy?.businessCalendar,
							);
						if (savedPolicy && !ticket.resolvedAt) {
							const target = savedPolicy.resolutionTargets?.[priority];
							deadlines.resolutionDueAt =
								target === undefined
									? null
									: deadline(
											ticket.createdAt,
											target,
											savedPolicy.businessCalendar,
										);
						}
					}
					const row = await mutations.updateTicketRecord(tx, ticket.id, {
						...data,
						resolvedAt,
						...deadlines,
						updatedAt: now,
					});
					return serializeTicket(row!);
				}),
			after: async ({ input, result, request }) => {
				const previous = previousTickets.get(input);
				previousTickets.delete(input);
				if (previous && !previous.resolvedAt && result.resolvedAt)
					await options.hooks?.onAfterResolveTicket?.(result, { request });
				if (previous)
					await options.hooks?.onAfterUpdateTicket?.(result, previous);
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
					const result = (await getters.getAgentTicket(tx, ticket.id))!;
					const { messages: _messages, ...ticketResult } = result;
					messageTickets.set(input, Object.freeze(ticketResult));
					return result;
				}),
			after: async ({ input }) => {
				const ticket = messageTickets.get(input);
				messageTickets.delete(input);
				if (ticket)
					await options.hooks?.onAfterCreateMessage?.(
						ticket,
						Object.freeze({
							authorType: "agent",
							isInternalNote: input.isInternalNote,
						}),
					);
			},
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
