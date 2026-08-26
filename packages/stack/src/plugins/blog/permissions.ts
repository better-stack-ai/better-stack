import { definePermissions, permission } from "../../authorization";
import { z } from "zod";

/** Browser-safe facts required to decide whether a Blog post may be deleted. */
export const blogPermissions = definePermissions("blog", {
	post: {
		delete: permission(
			z.object({
				id: z.string(),
				authorId: z.string().optional(),
			}),
		),
	},
});
