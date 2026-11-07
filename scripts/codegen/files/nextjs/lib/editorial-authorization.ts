import { defineAuthorization } from "@btst/stack/authorization";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import { z } from "zod";

export const editorialAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.read.when(
			({ identity, facts }) =>
				facts.scope === "published" ||
				(facts.scope === "post" && (!facts.exists || facts.published)) ||
				identity?.role === "admin" ||
				(identity !== null &&
					facts.scope === "post" &&
					identity.id === facts.authorId),
		),
		blog.post.create.when(
			({ identity, facts }) => identity !== null && facts.publish === "draft",
		),
		blog.post.update.when(
			({ identity, facts }) =>
				identity !== null && identity.id === facts.authorId,
		),
		blog.post.delete.when(({ identity }) => identity?.role === "admin"),
		blog.post.history.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		blog.post.restore.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		blog.post.editorialRead.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		blog.post.submit.when(
			({ identity, facts }) =>
				identity !== null && identity.id === facts.authorId,
		),
		blog.post.requestChanges.when(({ identity }) => identity?.role === "admin"),
		blog.post.approve.when(({ identity }) => identity?.role === "admin"),
		blog.post.publish.when(({ identity }) => identity?.role === "admin"),
		blog.tag.read.allow(),
	],
});
