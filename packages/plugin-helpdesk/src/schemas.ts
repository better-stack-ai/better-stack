import { z } from "zod";
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
	.object({ body: z.string().trim().min(1).max(20000) })
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
