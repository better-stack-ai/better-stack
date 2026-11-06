import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
import { feedbackStatusSchema } from "./schemas";

const postFacts = z.object({
	postId: z.string(),
	status: feedbackStatusSchema,
	authorId: z.string(),
});
export const feedbackPermissions = definePermissions("feedback", {
	post: {
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({
					scope: z.literal("record"),
					postId: z.string(),
					slug: z.string(),
				}),
			]),
		),
		create: permission(),
		vote: permission(postFacts),
		updateStatus: permission(postFacts),
	},
	changelog: { read: permission(), create: permission() },
});
