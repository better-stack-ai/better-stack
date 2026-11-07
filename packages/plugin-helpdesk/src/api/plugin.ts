import {
	createEndpoint,
	defineBackendPlugin,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { helpdeskSchema } from "../db";
import { HELPDESK_ATTACHMENT_MAX_BYTES } from "../types";
import * as schemas from "../schemas";
import {
	createHelpdeskOperations,
	type HelpdeskBackendOptions,
} from "./operations";
async function parseAttachmentUpload(body: unknown) {
	const fields = body as
		| { file?: unknown; isInternalNote?: unknown }
		| undefined;
	if (!(fields?.file instanceof File))
		throw new OperationHttpError(
			400,
			"A file is required",
			"HELPDESK_ATTACHMENT_INVALID",
		);
	if (fields.file.size < 1 || fields.file.size > HELPDESK_ATTACHMENT_MAX_BYTES)
		throw new OperationHttpError(
			413,
			"Attachments must be between 1 byte and 10 MiB",
			"HELPDESK_ATTACHMENT_SIZE",
		);
	if (
		fields.isInternalNote !== undefined &&
		fields.isInternalNote !== "true" &&
		fields.isInternalNote !== "false"
	)
		throw new OperationHttpError(
			400,
			"Invalid attachment audience",
			"HELPDESK_ATTACHMENT_INVALID",
		);
	return {
		filename: fields.file.name,
		mimeType: schemas.uploadAttachmentSchema.shape.mimeType.parse(
			fields.file.type,
		),
		contentBase64: Buffer.from(await fields.file.arrayBuffer()).toString(
			"base64",
		),
		isInternalNote: fields.isInternalNote === "true",
	};
}
/** Customer support portal and a separately authorized agent inbox. */
export const helpdeskBackendPlugin = (options: HelpdeskBackendOptions = {}) =>
	defineBackendPlugin({
		id: "helpdesk",
		dbPlugin: helpdeskSchema,
		operations: (adapter, context) => {
			if (!context?.auth)
				throw new Error("Helpdesk requires stack authorization");
			return createHelpdeskOperations(adapter, options);
		},
		routes: (_adapter, _context, operations) => ({
			uploadCustomerAttachment: createEndpoint(
				"/helpdesk/tickets/:id/attachments",
				{
					method: "POST",
					requireRequest: true,
					metadata: { allowedMediaTypes: ["multipart/form-data"] },
				},
				operations.uploadCustomerAttachment.route(async (ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return {
						id: ctx.params.id,
						...(await parseAttachmentUpload(ctx.body)),
					};
				}),
			),
			uploadAgentAttachment: createEndpoint(
				"/helpdesk/inbox/:id/attachments",
				{
					method: "POST",
					requireRequest: true,
					metadata: { allowedMediaTypes: ["multipart/form-data"] },
				},
				operations.uploadAgentAttachment.route(async (ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return {
						id: ctx.params.id,
						...(await parseAttachmentUpload(ctx.body)),
					};
				}),
			),
			downloadCustomerAttachment: createEndpoint(
				"/helpdesk/tickets/:id/attachments/:attachmentId",
				{
					method: "GET",
					requireRequest: true,
				},
				operations.downloadCustomerAttachment.route((ctx) => ({
					id: ctx.params.id,
					attachmentId: ctx.params.attachmentId,
				})),
			),
			downloadAgentAttachment: createEndpoint(
				"/helpdesk/inbox/:id/attachments/:attachmentId",
				{
					method: "GET",
					requireRequest: true,
				},
				operations.downloadAgentAttachment.route((ctx) => ({
					id: ctx.params.id,
					attachmentId: ctx.params.attachmentId,
				})),
			),
			deleteCustomerAttachment: createEndpoint(
				"/helpdesk/tickets/:id/attachments/:attachmentId",
				{
					method: "DELETE",
					requireRequest: true,
				},
				operations.deleteCustomerAttachment.route((ctx) => ({
					id: ctx.params.id,
					attachmentId: ctx.params.attachmentId,
				})),
			),
			deleteAgentAttachment: createEndpoint(
				"/helpdesk/inbox/:id/attachments/:attachmentId",
				{
					method: "DELETE",
					requireRequest: true,
				},
				operations.deleteAgentAttachment.route((ctx) => ({
					id: ctx.params.id,
					attachmentId: ctx.params.attachmentId,
				})),
			),
			listCustomerTickets: createEndpoint(
				"/helpdesk/tickets",
				{
					method: "GET",
					query: schemas.listTicketsSchema,
					requireRequest: true,
				},
				operations.listCustomerTickets.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			createTicket: createEndpoint(
				"/helpdesk/tickets",
				{
					method: "POST",
					body: schemas.createTicketSchema,
					requireRequest: true,
				},
				operations.createTicket.route((ctx) => ctx.body),
			),
			getCustomerTicket: createEndpoint(
				"/helpdesk/tickets/:id",
				{ method: "GET", requireRequest: true },
				operations.getCustomerTicket.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { id: ctx.params.id };
				}),
			),
			replyToTicket: createEndpoint(
				"/helpdesk/tickets/:id/replies",
				{
					method: "POST",
					body: schemas.customerReplySchema,
					requireRequest: true,
				},
				operations.replyToTicket.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			listAgentTickets: createEndpoint(
				"/helpdesk/inbox",
				{
					method: "GET",
					query: schemas.listTicketsSchema,
					requireRequest: true,
				},
				operations.listAgentTickets.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			getAgentTicket: createEndpoint(
				"/helpdesk/inbox/:id",
				{ method: "GET", requireRequest: true },
				operations.getAgentTicket.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { id: ctx.params.id };
				}),
			),
			updateTicket: createEndpoint(
				"/helpdesk/inbox/:id",
				{
					method: "PUT",
					body: schemas.updateTicketSchema,
					requireRequest: true,
				},
				operations.updateTicket.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			replyAsAgent: createEndpoint(
				"/helpdesk/inbox/:id/replies",
				{
					method: "POST",
					body: schemas.agentReplySchema,
					requireRequest: true,
				},
				operations.replyAsAgent.route((ctx) => ({
					id: ctx.params.id,
					...ctx.body,
				})),
			),
			listCannedReplies: createEndpoint(
				"/helpdesk/canned-replies",
				{
					method: "GET",
					query: schemas.paginationSchema,
					requireRequest: true,
				},
				operations.listCannedReplies.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			createCannedReply: createEndpoint(
				"/helpdesk/canned-replies",
				{
					method: "POST",
					body: schemas.cannedReplySchema,
					requireRequest: true,
				},
				operations.createCannedReply.route((ctx) => ctx.body),
			),
			updateCannedReply: createEndpoint(
				"/helpdesk/canned-replies/:id",
				{
					method: "PUT",
					body: schemas.cannedReplySchema,
					requireRequest: true,
				},
				operations.updateCannedReply.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteCannedReply: createEndpoint(
				"/helpdesk/canned-replies/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteCannedReply.route((ctx) => ({ id: ctx.params.id })),
			),
		}),
	});
/** Typed Helpdesk HTTP router. */
export type HelpdeskApiRouter = ReturnType<
	ReturnType<typeof helpdeskBackendPlugin>["routes"]
>;
export type { HelpdeskBackendOptions } from "./operations";
