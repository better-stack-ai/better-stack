import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { helpdeskSchema } from "../db";
import * as schemas from "../schemas";
import {
	createHelpdeskOperations,
	type HelpdeskBackendOptions,
} from "./operations";
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
