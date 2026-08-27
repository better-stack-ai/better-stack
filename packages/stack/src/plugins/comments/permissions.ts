import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const threadResourceFacts = {
	resourceId: z.string().optional(),
	resourceType: z.string().optional(),
};

/** Browser-safe, schema-backed permissions published by the Comments plugin. */
export const commentsPermissions = definePermissions("comments", {
	thread: {
		/** Read an explicitly public thread, an identity's own history, or a moderation queue. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({
					scope: z.literal("public"),
					resourceId: z.string(),
					resourceType: z.string(),
				}),
				z.object({ scope: z.literal("own"), authorId: z.string() }),
				z.object({
					scope: z.literal("moderation"),
					status: z.enum(["pending", "approved", "spam"]),
					...threadResourceFacts,
				}),
			]),
		),
		/** Create a top-level comment or reply in one resource thread. */
		createComment: permission(
			z.object({
				resourceId: z.string(),
				resourceType: z.string(),
				parentId: z.string().nullable(),
			}),
		),
	},
	comment: {
		/** Edit a server-resolved comment. */
		edit: permission(
			z.object({
				commentId: z.string(),
				authorId: z.string(),
				status: z.enum(["pending", "approved", "spam"]),
			}),
		),
		/** Delete a server-resolved comment. */
		delete: permission(
			z.object({ commentId: z.string(), authorId: z.string() }),
		),
		/** React to a server-resolved comment. */
		react: permission(
			z.object({
				commentId: z.string(),
				status: z.enum(["pending", "approved", "spam"]),
			}),
		),
		/** Change the moderation status of a server-resolved comment. */
		moderate: permission(
			z.object({
				commentId: z.string(),
				resourceId: z.string(),
				resourceType: z.string(),
				status: z.enum(["pending", "approved", "spam"]),
			}),
		),
	},
});
