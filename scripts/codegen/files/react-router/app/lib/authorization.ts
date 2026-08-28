import { defineAuthorization } from "@btst/stack/authorization";
import { aiChatPermissions } from "@btst/stack/plugins/ai-chat/permissions";
import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { cmsPermissions } from "@btst/stack/plugins/cms/permissions";
import { commentsPermissions } from "@btst/stack/plugins/comments/permissions";
import { formBuilderPermissions } from "@btst/stack/plugins/form-builder/permissions";
import { kanbanPermissions } from "@btst/stack/plugins/kanban/permissions";
import { mediaPermissions } from "@btst/stack/plugins/media/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";
import { z } from "zod";

const identitySchema = z.object({
	id: z.string(),
	role: z.enum(["user", "admin"]),
	organizationIds: z.array(z.string()),
});

type Identity = z.output<typeof identitySchema>;
type KanbanBoardFacts = {
	ownerId?: string;
	organizationId?: string;
};

type AiChatConversationFacts = {
	ownerId?: string;
};

function canUseAiChatConversation(
	identity: Identity | null,
	facts: AiChatConversationFacts,
) {
	return (
		identity !== null &&
		(identity.role === "admin" || identity.id === facts.ownerId)
	);
}

function canManageKanbanBoard(
	identity: Identity | null,
	facts: KanbanBoardFacts,
) {
	return (
		identity !== null &&
		(identity.role === "admin" ||
			identity.id === facts.ownerId ||
			(facts.organizationId !== undefined &&
				identity.organizationIds.includes(facts.organizationId)))
	);
}

/** Browser-safe authorization contract shared by the client and server adapters. */
export const authorization = defineAuthorization({
	identity: identitySchema,
	permissions: [
		aiChatPermissions,
		blogPermissions,
		cmsPermissions,
		commentsPermissions,
		formBuilderPermissions,
		kanbanPermissions,
		mediaPermissions,
	] as const,
	rules: ({ aiChat, blog, cms, comments, forms, kanban, media }) => [
		aiChat.conversation.read.when(({ identity, facts }) =>
			facts.scope === "collection"
				? identity !== null
				: canUseAiChatConversation(identity, facts),
		),
		aiChat.conversation.create.when(({ identity }) => identity !== null),
		aiChat.conversation.update.when(({ identity, facts }) =>
			canUseAiChatConversation(identity, facts),
		),
		aiChat.conversation.delete.when(({ identity, facts }) =>
			canUseAiChatConversation(identity, facts),
		),
		aiChat.message.send.when(
			({ identity, facts }) =>
				identity !== null &&
				(facts.createsConversation ||
					canUseAiChatConversation(identity, facts)),
		),
		aiChat.message.edit.when(({ identity, facts }) =>
			canUseAiChatConversation(identity, facts),
		),
		aiChat.message.retry.when(({ identity, facts }) =>
			canUseAiChatConversation(identity, facts),
		),
		aiChat.attachment.send.when(({ identity, facts }) =>
			facts.conversationId === undefined
				? identity !== null
				: canUseAiChatConversation(identity, facts),
		),
		aiChat.tool.activate.when(({ identity, facts }) =>
			facts.conversationId === undefined
				? identity !== null
				: canUseAiChatConversation(identity, facts),
		),
		aiChat.stream.start.when(
			({ identity, facts }) =>
				identity !== null &&
				(facts.createsConversation ||
					canUseAiChatConversation(identity, facts)),
		),
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
		cms.contentType.read.when(
			({ identity, facts }) =>
				facts.contentType === UI_BUILDER_TYPE_SLUG ||
				identity?.role === "admin",
		),
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
		forms.form.read.when(
			({ identity, facts }) =>
				identity?.role === "admin" ||
				(facts.scope === "record" && identity?.id === facts.ownerId),
		),
		forms.form.render.allow(),
		forms.form.create.when(({ identity }) => identity?.role === "admin"),
		forms.form.update.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		forms.form.delete.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		forms.submission.create.allow(),
		forms.submission.read.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		forms.submission.delete.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		kanban.board.read.when(({ identity, facts }) =>
			facts.scope === "collection"
				? identity?.role === "admin"
				: canManageKanbanBoard(identity, facts),
		),
		kanban.board.create.when(({ identity }) => identity !== null),
		kanban.board.update.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.board.delete.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.column.create.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.column.update.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.column.delete.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.column.reorder.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.task.create.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.task.update.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.task.move.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.task.delete.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		kanban.task.reorder.when(({ identity, facts }) =>
			canManageKanbanBoard(identity, facts),
		),
		media.library.read.when(({ identity }) => identity !== null),
		media.asset.read.when(({ identity }) => identity !== null),
		media.asset.upload.when(
			({ identity, facts }) => facts.phase === "callback" || identity !== null,
		),
		media.asset.update.when(({ identity }) => identity !== null),
		media.asset.delete.when(({ identity }) => identity !== null),
		media.folder.create.when(({ identity }) => identity !== null),
		media.folder.delete.when(({ identity }) => identity !== null),
	],
});
