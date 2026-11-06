import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const affiliateFacts = z.object({
	affiliateId: z.string(),
	userId: z.string(),
	status: z.enum(["pending", "approved", "suspended"]),
});

/** Administrative permissions are separate from identity-scoped portal access. */
export const affiliatePermissions = definePermissions("affiliate", {
	affiliate: {
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({ scope: z.literal("record"), affiliateId: z.string() }),
			]),
		),
		create: permission(),
		update: permission(affiliateFacts),
		delete: permission(affiliateFacts),
	},
	application: { create: permission() },
	portal: { read: permission(), update: permission() },
	tracking: { track: permission() },
	conversion: { create: permission() },
	commission: {
		read: permission(),
		update: permission(
			z.object({
				commissionId: z.string(),
				affiliateId: z.string(),
				status: z.enum(["pending", "approved", "paid", "voided"]),
			}),
		),
	},
	payout: {
		read: permission(),
		create: permission(
			z.object({ affiliateId: z.string(), currency: z.string() }),
		),
		update: permission(
			z.object({
				payoutId: z.string(),
				affiliateId: z.string(),
				status: z.enum(["pending", "sent", "failed"]),
			}),
		),
		export: permission(),
	},
});
