import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

/** Permissions for public job projections; CMS management retains its own permissions. */
export const jobBoardPermissions = definePermissions("jobBoard", {
	job: {
		/** Read published, unexpired jobs and their public taxonomy terms. */
		read: permission(
			z.object({
				scope: z.enum(["collection", "record"]),
				slug: z.string().optional(),
			}),
		),
	},
});
