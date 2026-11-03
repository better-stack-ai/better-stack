import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const subscriberFacts = z.object({
	subscriberId: z.string(),
	status: z.enum(["subscribed", "unsubscribed", "bounced"]),
});
const campaignFacts = z.object({
	campaignId: z.string(),
	status: z.enum(["draft", "scheduled", "sending", "sent"]),
});
/** Browser-safe management permissions. Public bearer-token operations validate their own tokens. */
export const newsletterPermissions = definePermissions("newsletter", {
	subscriber: {
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({ scope: z.literal("record"), subscriberId: z.string() }),
			]),
		),
		create: permission(),
		update: permission(subscriberFacts),
		delete: permission(subscriberFacts),
		import: permission(),
		export: permission(),
		subscribe: permission(),
		confirm: permission(),
		unsubscribe: permission(),
	},
	campaign: {
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({ scope: z.literal("record"), campaignId: z.string() }),
			]),
		),
		create: permission(),
		update: permission(campaignFacts),
		delete: permission(campaignFacts),
		send: permission(campaignFacts),
		test: permission(campaignFacts),
		schedule: permission(campaignFacts),
	},
	analytics: { read: permission(), track: permission() },
	transactional: { send: permission() },
	scheduler: { run: permission() },
});
