import { z } from "zod";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { blogPermissions } from "@btst/plugin-blog/permissions";

export const auth = createClientAuth({
	authorization: defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [blogPermissions],
		rules: ({ blog }) => [
			blog.post.read.allow(),
			blog.post.create.allow(),
			blog.tag.read.allow(),
		],
	}),
	getIdentity: () => ({ id: "benchmark-user" }),
});
