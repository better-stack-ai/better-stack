import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

/** Browser-safe, schema-backed permissions published by the CMS plugin. */
export const cmsPermissions = definePermissions("cms", {
	contentType: {
		/** Read the content-type catalog or one server-resolved content type. */
		read: permission(
			z.object({
				contentType: z.string().optional(),
			}),
		),
	},
	record: {
		/** Read a content-type collection or one server-resolved record. */
		read: permission(
			z.object({
				contentType: z.string(),
				scope: z.enum(["collection", "record"]),
				recordId: z.string().optional(),
				authorId: z.string().optional(),
			}),
		),
		/** Create a record for a server-resolved content type. */
		create: permission(z.object({ contentType: z.string() })),
		/** Update a server-resolved record. */
		update: permission(
			z.object({
				contentType: z.string(),
				recordId: z.string(),
				authorId: z.string().optional(),
			}),
		),
		/** Delete a server-resolved record. */
		delete: permission(
			z.object({
				contentType: z.string(),
				recordId: z.string(),
				authorId: z.string().optional(),
			}),
		),
	},
});
