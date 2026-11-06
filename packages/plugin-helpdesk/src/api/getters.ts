/** Lower-level reads bypass operation authorization; callers own access checks. */
import type { DBAdapter as Adapter } from "@btst/db";
import type { z } from "zod";
import type { listTicketsSchema, paginationSchema } from "../schemas";
import type {
	CannedReplyRecord,
	CustomerMessage,
	MessageRecord,
	TicketRecord,
} from "../types";
import {
	serializeCannedReply,
	serializeCustomerMessage,
	serializeCustomerTicket,
	serializeMessage,
	serializeTicket,
} from "./serializers";
export type HelpdeskDataAdapter = Pick<
	Adapter,
	| "findOne"
	| "findMany"
	| "count"
	| "create"
	| "update"
	| "delete"
	| "incrementOne"
>;
export function getTicketRecord(adapter: HelpdeskDataAdapter, id: string) {
	return adapter.findOne<TicketRecord>({
		model: "helpdeskTicket",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export async function listTickets(
	adapter: HelpdeskDataAdapter,
	query: z.output<typeof listTicketsSchema>,
	customerId?: string,
) {
	const where = [
		...(customerId !== undefined
			? [{ field: "customerId", value: customerId, operator: "eq" as const }]
			: []),
		...(query.status
			? [{ field: "status", value: query.status, operator: "eq" as const }]
			: []),
		...(query.priority
			? [{ field: "priority", value: query.priority, operator: "eq" as const }]
			: []),
		...(query.assigneeId
			? [
					{
						field: "assigneeId",
						value: query.assigneeId,
						operator: "eq" as const,
					},
				]
			: []),
	];
	const term = query.search?.normalize("NFC").toLowerCase();
	const items: TicketRecord[] = [];
	for (let offset = 0; ; offset += 200) {
		const page = await adapter.findMany<TicketRecord>({
			model: "helpdeskTicket",
			where,
			limit: 200,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		for (const ticket of page) {
			const subject =
				customerId !== undefined
					? serializeCustomerTicket(ticket).subject
					: ticket.subject;
			if (
				!term ||
				subject.normalize("NFC").toLowerCase().includes(term) ||
				(await messagesMatchSearch(
					adapter,
					ticket.id,
					term,
					customerId !== undefined,
				))
			) {
				items.push(ticket);
			}
		}
		if (page.length < 200) break;
	}
	items.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
			(a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
	);
	return {
		items: items.slice(query.offset, query.offset + query.limit),
		total: items.length,
	};
}
/** Customer reads are scoped in storage and serialized with explicit public fields. */
export async function listCustomerTickets(
	adapter: HelpdeskDataAdapter,
	query: z.output<typeof listTicketsSchema>,
	customerId: string,
) {
	const page = await listTickets(
		adapter,
		{ ...query, assigneeId: undefined },
		customerId,
	);
	return { ...page, items: page.items.map(serializeCustomerTicket) };
}
export async function listAgentTickets(
	adapter: HelpdeskDataAdapter,
	query: z.output<typeof listTicketsSchema>,
) {
	const page = await listTickets(adapter, query);
	return { ...page, items: page.items.map(serializeTicket) };
}
async function messagesMatchSearch(
	adapter: HelpdeskDataAdapter,
	ticketId: string,
	term: string,
	publicOnly: boolean,
) {
	for (let offset = 0; ; offset += 200) {
		const page = await adapter.findMany<MessageRecord>({
			model: "helpdeskMessage",
			where: [
				{ field: "ticketId", value: ticketId, operator: "eq" },
				...(publicOnly
					? [{ field: "isInternalNote", value: false, operator: "eq" as const }]
					: []),
			],
			limit: 200,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		for (const row of page) {
			const message = publicOnly
				? serializeCustomerMessage(row)
				: serializeMessage(row);
			if (message?.body.normalize("NFC").toLowerCase().includes(term))
				return true;
		}
		if (page.length < 200) return false;
	}
}
async function listMessages(
	adapter: HelpdeskDataAdapter,
	ticketId: string,
	publicOnly: boolean,
) {
	const items: MessageRecord[] = [];
	for (let offset = 0; ; offset += 200) {
		const page = await adapter.findMany<MessageRecord>({
			model: "helpdeskMessage",
			where: [
				{ field: "ticketId", value: ticketId, operator: "eq" },
				...(publicOnly
					? [{ field: "isInternalNote", value: false, operator: "eq" as const }]
					: []),
			],
			limit: 200,
			offset,
			sortBy: { field: "createdAt", direction: "asc" },
		});
		items.push(...page);
		if (page.length < 200) return items;
	}
}
export async function getCustomerTicket(
	adapter: HelpdeskDataAdapter,
	id: string,
	customerId: string,
) {
	const row = await adapter.findOne<TicketRecord>({
		model: "helpdeskTicket",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "customerId", value: customerId, operator: "eq" },
		],
	});
	if (!row) return null;
	const messages = (await listMessages(adapter, id, true))
		.map(serializeCustomerMessage)
		.filter((message): message is CustomerMessage => message !== null);
	return { ...serializeCustomerTicket(row), messages };
}
export async function getAgentTicket(adapter: HelpdeskDataAdapter, id: string) {
	const row = await getTicketRecord(adapter, id);
	if (!row) return null;
	return {
		...serializeTicket(row),
		messages: (await listMessages(adapter, id, false)).map(serializeMessage),
	};
}
export function getCannedReplyRecord(adapter: HelpdeskDataAdapter, id: string) {
	return adapter.findOne<CannedReplyRecord>({
		model: "helpdeskCannedReply",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export async function listCannedReplies(
	adapter: HelpdeskDataAdapter,
	query: z.output<typeof paginationSchema>,
) {
	const [items, total] = await Promise.all([
		adapter.findMany<CannedReplyRecord>({
			model: "helpdeskCannedReply",
			limit: query.limit,
			offset: query.offset,
			sortBy: { field: "title", direction: "asc" },
		}),
		adapter.count({ model: "helpdeskCannedReply" }),
	]);
	return { items: items.map(serializeCannedReply), total };
}
