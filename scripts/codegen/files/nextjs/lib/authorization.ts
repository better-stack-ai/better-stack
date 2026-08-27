import { defineAuthorization } from "@btst/stack/authorization";
import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { cmsPermissions } from "@btst/stack/plugins/cms/permissions";
import { commentsPermissions } from "@btst/stack/plugins/comments/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";
import { z } from "zod";

/** Browser-safe authorization contract shared by the client and server adapters. */
export const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions, cmsPermissions, commentsPermissions] as const,
	rules: ({ blog, cms, comments }) => [
		blog.post.read.when(({ identity, facts }) => {
			if (facts.scope === "published") return true;
			if (facts.scope === "post" && (!facts.exists || facts.published)) {
				return true;
			}
			if (facts.scope === "drafts") return identity !== null;
			return (
				identity?.role === "admin" ||
				(facts.scope === "post" && identity?.id === facts.authorId)
			);
		}),
		blog.post.create.when(
			({ identity, facts }) =>
				identity !== null &&
				(facts.publish === "draft" || identity.role === "admin"),
		),
		blog.post.update.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" ||
					(identity.id === facts.authorId && facts.publish === "unchanged")),
		),
		blog.post.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		blog.tag.read.allow(),
		cms.contentType.read.when(({ identity }) => identity?.role === "admin"),
		cms.record.read.when(
			({ identity, facts }) =>
				(facts.contentType === UI_BUILDER_TYPE_SLUG &&
					facts.scope === "record") ||
				identity?.role === "admin",
		),
		cms.record.create.when(({ identity }) => identity?.role === "admin"),
		cms.record.update.when(({ identity }) => identity?.role === "admin"),
		cms.record.delete.when(({ identity }) => identity?.role === "admin"),
		comments.thread.read.when(({ identity, facts }) => {
			if (facts.scope === "public") return true;
			if (facts.scope === "own") {
				return identity?.role === "admin" || identity?.id === facts.authorId;
			}
			return identity?.role === "admin";
		}),
		comments.thread.createComment.when(({ identity }) => identity !== null),
		comments.comment.edit.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		comments.comment.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
		comments.comment.react.when(
			({ identity, facts }) => identity !== null && facts.status === "approved",
		),
		comments.comment.moderate.when(
			({ identity }) => identity?.role === "admin",
		),
	],
});
