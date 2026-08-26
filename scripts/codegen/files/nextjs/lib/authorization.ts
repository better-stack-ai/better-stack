import { defineAuthorization } from "@btst/stack/authorization";
import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { z } from "zod";

/** Browser-safe authorization contract shared by the client and server adapters. */
export const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.delete.when(
			({ identity, params }) =>
				identity?.role === "admin" || identity?.id === params.authorId,
		),
	],
});
