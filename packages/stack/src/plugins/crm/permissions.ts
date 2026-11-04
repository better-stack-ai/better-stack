import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
const record = z.object({ id: z.string() });
const deal = z.object({
	id: z.string(),
	pipelineId: z.string(),
	contactId: z.string().nullable(),
	companyId: z.string().nullable(),
});
/** CRM operations are private by default; applications grant access through their shared authorization rules. */
export const crmPermissions = definePermissions("crm", {
	contact: {
		read: permission(),
		create: permission(),
		update: permission(record),
		delete: permission(record),
	},
	company: {
		read: permission(),
		create: permission(),
		update: permission(record),
		delete: permission(record),
	},
	deal: {
		read: permission(),
		create: permission(
			z.object({
				pipelineId: z.string(),
				stage: z.string(),
				contactId: z.string().nullable(),
				companyId: z.string().nullable(),
			}),
		),
		update: permission(deal),
		delete: permission(deal),
		move: permission(deal.extend({ targetStage: z.string() })),
	},
	pipeline: { read: permission(), create: permission() },
	activity: {
		read: permission(),
		create: permission(
			z.object({
				contactId: z.string().nullable(),
				dealId: z.string().nullable(),
			}),
		),
		update: permission(record),
		delete: permission(record),
	},
	reminder: { run: permission() },
});
