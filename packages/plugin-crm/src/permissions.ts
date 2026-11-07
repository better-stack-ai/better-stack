import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
const record = z.object({ id: z.string() });
const merge = z.object({ survivorId: z.string(), sourceId: z.string() });
const deal = z.object({
	id: z.string(),
	pipelineId: z.string(),
	contactId: z.string().nullable(),
	companyId: z.string().nullable(),
	ownerId: z.string().nullable(),
	taskId: z.string(),
});
/** CRM operations are private by default; applications grant access through their shared authorization rules. */
export const crmPermissions = definePermissions("crm", {
	contact: {
		read: permission(),
		create: permission(),
		update: permission(record),
		delete: permission(record),
		merge: permission(merge),
	},
	company: {
		read: permission(),
		create: permission(),
		update: permission(record),
		delete: permission(record),
		merge: permission(merge),
	},
	owner: { read: permission() },
	deal: {
		/** Assign or clear ownership using server-resolved current and proposed owners. */
		assign: permission(
			z.object({
				id: z.string(),
				taskId: z.string(),
				pipelineId: z.string(),
				currentOwnerId: z.string().nullable(),
				proposedOwnerId: z.string().nullable(),
			}),
		),
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
