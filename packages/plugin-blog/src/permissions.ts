import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

/** Browser-safe, schema-backed permissions published by the Blog plugin. */
export const blogPermissions = definePermissions("blog", {
	post: {
		/** Read published posts, draft collections, or one server-resolved post. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("published") }),
				z.object({ scope: z.literal("drafts") }),
				z.object({
					scope: z.literal("post"),
					slug: z.string(),
					exists: z.boolean(),
					id: z.string().optional(),
					authorId: z.string().optional(),
					published: z.boolean(),
				}),
			]),
		),
		/** Create a draft or create-and-publish in one request. */
		create: permission(z.object({ publish: z.enum(["draft", "published"]) })),
		/** Update post content or its publish state. */
		update: permission(
			z.object({
				id: z.string(),
				authorId: z.string().optional(),
				publish: z.enum(["unchanged", "publish", "unpublish"]),
			}),
		),
		/** Delete a server-resolved post. */
		delete: permission(
			z.object({
				id: z.string(),
				authorId: z.string().optional(),
			}),
		),
	},
	tag: {
		/** Read the public tag catalog. */
		read: permission(),
	},
});
