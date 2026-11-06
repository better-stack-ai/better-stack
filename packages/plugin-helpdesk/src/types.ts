/** Supported support-ticket lifecycle states. */
export type TicketStatus = "open" | "pending" | "resolved" | "closed";
/** Ticket urgency determines the first-response SLA target. */
export type TicketPriority = "low" | "medium" | "high" | "urgent";
/** Agent ticket projection; timestamps are UTC ISO strings. */
export type HelpdeskTicket = {
	id: string;
	subject: string;
	status: TicketStatus;
	priority: TicketPriority;
	customerId: string;
	assigneeId: string | null;
	slaDueAt: string;
	firstRespondedAt: string | null;
	resolvedAt: string | null;
	createdAt: string;
	updatedAt: string;
};
/** Customer projection excludes assignment, ownership and SLA internals. */
export type CustomerTicket = Pick<
	HelpdeskTicket,
	| "id"
	| "subject"
	| "status"
	| "priority"
	| "resolvedAt"
	| "createdAt"
	| "updatedAt"
>;
/** Agent conversation entry, including internal notes. */
export type HelpdeskMessage = {
	id: string;
	ticketId: string;
	body: string;
	authorId: string;
	authorType: "customer" | "agent";
	isInternalNote: boolean;
	createdAt: string;
};
/** Public conversation entry, without private actor identifiers or note flags. */
export type CustomerMessage = Pick<
	HelpdeskMessage,
	"id" | "ticketId" | "body" | "authorType" | "createdAt"
>;
/** Customer detail contains only public messages. */
export type CustomerTicketDetail = CustomerTicket & {
	messages: CustomerMessage[];
};
/** Agent detail contains public replies and internal notes. */
export type HelpdeskTicketDetail = HelpdeskTicket & {
	messages: HelpdeskMessage[];
};
/** Reusable agent reply text. */
export type HelpdeskCannedReply = {
	id: string;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
};
/** Server-side list filters and pagination. */
export type HelpdeskListParams = {
	status?: TicketStatus;
	priority?: TicketPriority;
	assigneeId?: string;
	limit?: number;
	offset?: number;
};
/** Per-priority first-response targets in elapsed minutes. */
export type HelpdeskSlaTargets = Record<TicketPriority, number>;
/** Database ticket row; lockVersion is never exposed to clients. */
export type TicketRecord = Omit<
	HelpdeskTicket,
	"slaDueAt" | "firstRespondedAt" | "resolvedAt" | "createdAt" | "updatedAt"
> & {
	lockVersion: string;
	slaDueAt: Date;
	firstRespondedAt: Date | null;
	resolvedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
/** Database conversation row. */
export type MessageRecord = Omit<HelpdeskMessage, "createdAt"> & {
	createdAt: Date;
};
/** Database canned reply row. */
export type CannedReplyRecord = Omit<
	HelpdeskCannedReply,
	"createdAt" | "updatedAt"
> & { createdAt: Date; updatedAt: Date };
