import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
const ticketFacts = z.object({ ticketId: z.string(), customerId: z.string() });
/** Customer portal and agent permissions are separate; agents require explicit grants. */
export const helpdeskPermissions = definePermissions("helpdesk", {
	customerTicket: {
		list: permission(),
		create: permission(),
		read: permission(ticketFacts),
		reply: permission(ticketFacts),
	},
	ticket: {
		list: permission(),
		read: permission(ticketFacts),
		update: permission(ticketFacts),
		reply: permission(ticketFacts),
	},
	cannedReply: {
		list: permission(),
		create: permission(),
		update: permission(z.object({ id: z.string() })),
		delete: permission(z.object({ id: z.string() })),
	},
});
