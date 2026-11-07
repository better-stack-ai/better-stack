import type {
	CannedReplyRecord,
	CustomerMessage,
	CustomerTicket,
	HelpdeskCannedReply,
	HelpdeskMessage,
	HelpdeskTicket,
	MessageRecord,
	TicketRecord,
} from "../types";
const iso = (value: Date | string) => new Date(value).toISOString();
/** Explicit agent projection prevents storage lock data from escaping. */
export function serializeTicket(row: TicketRecord): HelpdeskTicket {
	return {
		id: row.id,
		subject: row.subject,
		status: row.status,
		priority: row.priority,
		customerId: row.customerId,
		requesterEmail: row.requesterEmail ?? null,
		assigneeId: row.assigneeId ?? null,
		slaDueAt: iso(row.slaDueAt),
		resolutionDueAt: row.resolutionDueAt ? iso(row.resolutionDueAt) : null,
		firstRespondedAt: row.firstRespondedAt ? iso(row.firstRespondedAt) : null,
		resolvedAt: row.resolvedAt ? iso(row.resolvedAt) : null,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}
/** Allowlist customer fields rather than deleting known private fields. */
export function serializeCustomerTicket(row: TicketRecord): CustomerTicket {
	return {
		id: row.id,
		subject: row.subject,
		status: row.status,
		priority: row.priority,
		resolvedAt: row.resolvedAt ? iso(row.resolvedAt) : null,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}
export function serializeMessage(row: MessageRecord): HelpdeskMessage {
	return {
		id: row.id,
		ticketId: row.ticketId,
		body: row.body,
		authorId: row.authorId,
		authorType: row.authorType,
		isInternalNote: row.isInternalNote,
		createdAt: iso(row.createdAt),
	};
}
/** Defense in depth: an internal note cannot be serialized as a public message. */
export function serializeCustomerMessage(
	row: MessageRecord,
): CustomerMessage | null {
	if (row.isInternalNote) return null;
	return {
		id: row.id,
		ticketId: row.ticketId,
		body: row.body,
		authorType: row.authorType,
		createdAt: iso(row.createdAt),
	};
}
export function serializeCannedReply(
	row: CannedReplyRecord,
): HelpdeskCannedReply {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}
