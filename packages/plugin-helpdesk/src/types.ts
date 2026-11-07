/** Fixed private-upload limits shared with the composer. */
export const HELPDESK_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const HELPDESK_ATTACHMENT_MAX_COUNT = 5;
export const HELPDESK_ATTACHMENT_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/plain",
] as const;
/** Public metadata; storage keys and delivery URLs never leave the server. */
export type HelpdeskAttachment = {
	id: string;
	filename: string;
	mimeType: string;
	size: number;
};
/** Application-owned private object storage. Never expose these objects at public URLs. */
export type HelpdeskAttachmentStorage = {
	put: (input: { key: string; file: File }) => Promise<void>;
	get: (input: { key: string }) => Promise<Blob | null>;
	delete: (input: { key: string }) => Promise<void>;
};
/** Internal upload row, bound to its uploader, ticket, audience and eventual message. */
export type AttachmentRecord = HelpdeskAttachment & {
	ticketId: string;
	messageId: string | null;
	ownerId: string;
	isInternalNote: boolean;
	storageKey: string;
	ready: boolean;
	createdAt: Date;
};
/** Supported support-ticket lifecycle states. */
export type TicketStatus = "open" | "pending" | "resolved" | "closed";
/** Ticket urgency determines response and optional resolution SLA targets. */
export type TicketPriority = "low" | "medium" | "high" | "urgent";
/** Agent ticket projection; timestamps are UTC ISO strings. */
export type HelpdeskTicket = {
	id: string;
	subject: string;
	status: TicketStatus;
	priority: TicketPriority;
	customerId: string;
	requesterEmail: string | null;
	assigneeId: string | null;
	slaDueAt: string;
	/** Resolution deadline; absent/null on tickets without a resolution target. */
	resolutionDueAt?: string | null;
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
	attachments: HelpdeskAttachment[];
	createdAt: string;
};
/** Public conversation entry, without private actor identifiers or note flags. */
export type CustomerMessage = Pick<
	HelpdeskMessage,
	"id" | "ticketId" | "body" | "authorType" | "createdAt" | "attachments"
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
	/** Literal case-insensitive subject/conversation search; trimmed NFC text, at most 200 UTF-16 code units. */
	search?: string;
	status?: TicketStatus;
	priority?: TicketPriority;
	assigneeId?: string;
	limit?: number;
	offset?: number;
};
/** Per-priority target minutes; elapsed or working time according to the SLA calendar. */
export type HelpdeskSlaTargets = Record<TicketPriority, number>;
/** A same-day working interval in the business calendar's local timezone. */
export type HelpdeskWorkingInterval = {
	/** Sunday is 0; Saturday is 6. */
	dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	/** Inclusive HH:mm start; 00:00 through 23:59. */
	start: string;
	/** Exclusive HH:mm end; 24:00 is allowed. Overnight intervals must be split. */
	end: string;
};
/** Opt-in working hours and closed holiday dates, evaluated in an IANA timezone. */
export type HelpdeskBusinessCalendar = {
	timeZone: string;
	workingIntervals: HelpdeskWorkingInterval[];
	/** Closed local dates in YYYY-MM-DD format. */
	holidays?: string[];
};
/** Database ticket row; lockVersion is never exposed to clients. */
export type TicketRecord = Omit<
	HelpdeskTicket,
	| "slaDueAt"
	| "resolutionDueAt"
	| "firstRespondedAt"
	| "resolvedAt"
	| "createdAt"
	| "updatedAt"
> & {
	lockVersion: string;
	slaDueAt: Date;
	resolutionDueAt?: Date | null;
	/** Versioned JSON policy snapshot; absent/null retains legacy elapsed-time behavior. */
	slaPolicy?: string | null;
	firstRespondedAt: Date | null;
	resolvedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
/** Database conversation row. */
export type MessageRecord = Omit<
	HelpdeskMessage,
	"createdAt" | "attachments"
> & {
	createdAt: Date;
};
/** Database canned reply row. */
export type CannedReplyRecord = Omit<
	HelpdeskCannedReply,
	"createdAt" | "updatedAt"
> & { createdAt: Date; updatedAt: Date };
