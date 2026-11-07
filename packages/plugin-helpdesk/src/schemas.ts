import { z } from "zod";
import {
	HELPDESK_ATTACHMENT_MAX_COUNT,
	HELPDESK_ATTACHMENT_MAX_BYTES,
	HELPDESK_ATTACHMENT_MIME_TYPES,
} from "./types";
export const attachmentIdsSchema = z
	.array(z.string().min(1).max(200))
	.max(HELPDESK_ATTACHMENT_MAX_COUNT)
	.refine((ids) => new Set(ids).size === ids.length, "Duplicate attachments")
	.default([]);
export const attachmentInputSchema = z.object({
	id: z.string().min(1).max(200),
	attachmentId: z.string().min(1).max(200),
});
export const uploadAttachmentSchema = z.object({
	id: z.string().min(1).max(200),
	filename: z
		.string()
		.trim()
		.min(1)
		.max(255)
		.refine((name) => !/[\x00-\x1f\x7f/\\]/.test(name), "Invalid filename"),
	mimeType: z.enum(HELPDESK_ATTACHMENT_MIME_TYPES),
	contentBase64: z
		.string()
		.min(4)
		.max(Math.ceil(HELPDESK_ATTACHMENT_MAX_BYTES / 3) * 4),
	isInternalNote: z.boolean().default(false),
});
export const ticketStatusSchema = z.enum([
	"open",
	"pending",
	"resolved",
	"closed",
]);
export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const idSchema = z.object({ id: z.string().min(1).max(200) });
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export const listTicketsSchema = paginationSchema.extend({
	search: z.string().trim().normalize("NFC").max(200).optional(),
	status: ticketStatusSchema.optional(),
	priority: ticketPrioritySchema.optional(),
	assigneeId: z.string().min(1).max(200).optional(),
});
export const createTicketSchema = z
	.object({
		subject: z.string().trim().min(1).max(250),
		requesterEmail: z.email().max(320).optional(),
		body: z.string().trim().min(1).max(20000),
		priority: ticketPrioritySchema.default("medium"),
	})
	.strict();
export const customerReplySchema = z
	.object({
		body: z.string().trim().min(1).max(20000),
		attachmentIds: attachmentIdsSchema,
	})
	.strict();
export const agentReplySchema = customerReplySchema.extend({
	isInternalNote: z.boolean().default(false),
});
export const updateTicketSchema = z
	.object({
		status: ticketStatusSchema.optional(),
		priority: ticketPrioritySchema.optional(),
		assigneeId: z.string().trim().min(1).max(200).nullable().optional(),
	})
	.strict();
export const cannedReplySchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		body: z.string().trim().min(1).max(20000),
	})
	.strict();
