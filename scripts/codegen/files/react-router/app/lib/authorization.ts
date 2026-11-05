import { defineAuthorization } from "@btst/stack/authorization";
import { aiChatPermissions } from "@btst/plugin-ai-chat/permissions";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { commentsPermissions } from "@btst/stack/plugins/comments/permissions";
import { crmPermissions } from "@btst/plugin-crm/permissions";
import { newsletterPermissions } from "@btst/plugin-newsletter/permissions";
import { schoolPermissions } from "@btst/plugin-school/permissions";
import { ecommercePermissions } from "@btst/plugin-ecommerce/permissions";
import { featureFlagsPermissions } from "@btst/stack/plugins/feature-flags/permissions";
import { affiliatePermissions } from "@btst/stack/plugins/affiliate/permissions";
import { analyticsPermissions } from "@btst/stack/plugins/analytics/permissions";
import { calendarPermissions } from "@btst/stack/plugins/calendar/permissions";
import { jobBoardPermissions } from "@btst/plugin-job-board/permissions";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import { mediaPermissions } from "@btst/plugin-media/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/plugin-ui-builder";
import { z } from "zod";
import { todoPermissions } from "./plugins/todo/permissions";

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
		crmPermissions,
		newsletterPermissions,
		schoolPermissions,
		affiliatePermissions,
		analyticsPermissions,
		ecommercePermissions,
		featureFlagsPermissions,
		calendarPermissions,
		jobBoardPermissions,
		formBuilderPermissions,
		kanbanPermissions,
		mediaPermissions,
		todoPermissions,
	] as const,
	rules: ({
		aiChat,
		blog,
		crm,
		newsletter,
		school,
		affiliate,
		analytics,
		ecommerce,
		featureFlags,
		calendar,
		jobBoard,
		cms,
		comments,
		forms,
		kanban,
		media,
		todos,
	}) => [
		crm.contact.read.when(({ identity }) => identity?.role === "admin"),
		crm.contact.create.when(({ identity }) => identity?.role === "admin"),
		crm.contact.update.when(({ identity }) => identity?.role === "admin"),
		crm.contact.delete.when(({ identity }) => identity?.role === "admin"),
		crm.company.read.when(({ identity }) => identity?.role === "admin"),
		crm.company.create.when(({ identity }) => identity?.role === "admin"),
		crm.company.update.when(({ identity }) => identity?.role === "admin"),
		crm.company.delete.when(({ identity }) => identity?.role === "admin"),
		crm.deal.read.when(({ identity }) => identity?.role === "admin"),
		crm.deal.create.when(({ identity }) => identity?.role === "admin"),
		crm.deal.update.when(({ identity }) => identity?.role === "admin"),
		crm.deal.delete.when(({ identity }) => identity?.role === "admin"),
		crm.deal.move.when(({ identity }) => identity?.role === "admin"),
		crm.pipeline.read.when(({ identity }) => identity?.role === "admin"),
		crm.pipeline.create.when(({ identity }) => identity?.role === "admin"),
		crm.activity.read.when(({ identity }) => identity?.role === "admin"),
		crm.activity.create.when(({ identity }) => identity?.role === "admin"),
		crm.activity.update.when(({ identity }) => identity?.role === "admin"),
		crm.activity.delete.when(({ identity }) => identity?.role === "admin"),
		crm.reminder.run.when(({ identity }) => identity?.role === "admin"),

		newsletter.subscriber.read.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.subscriber.create.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.subscriber.update.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.subscriber.delete.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.subscriber.import.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.subscriber.export.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.campaign.read.when(({ identity }) => identity?.role === "admin"),
		newsletter.campaign.create.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.campaign.update.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.campaign.delete.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.campaign.send.when(({ identity }) => identity?.role === "admin"),
		newsletter.campaign.test.when(({ identity }) => identity?.role === "admin"),
		newsletter.campaign.schedule.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.analytics.read.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.transactional.send.when(
			({ identity }) => identity?.role === "admin",
		),
		newsletter.scheduler.run.when(({ identity }) => identity?.role === "admin"),
		jobBoard.job.read.allow(),
		school.course.read.when(
			({ identity, facts }) =>
				facts.scope === "catalog" ||
				(facts.scope === "instructor" &&
					facts.instructorId === undefined &&
					identity !== null) ||
				(facts.scope === "course" && facts.status === "published") ||
				(identity !== null &&
					(identity.role === "admin" || identity.id === facts.instructorId)),
		),
		school.course.create.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.instructorId),
		),
		school.course.manage.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.instructorId),
		),
		school.enrollment.read.when(
			({ identity, facts }) =>
				identity !== null &&
				(facts.scope === "own"
					? facts.userId === undefined || identity.id === facts.userId
					: identity.role === "admin" || identity.id === facts.instructorId),
		),
		school.enrollment.enroll.when(({ identity }) => identity !== null),
		school.lesson.read.when(
			({ identity, facts }) =>
				(facts.status === "published" &&
					(facts.isFreePreview || identity !== null)) ||
				(identity !== null &&
					(identity.role === "admin" || identity.id === facts.instructorId)),
		),
		school.lesson.complete.when(({ identity }) => identity !== null),
		school.quiz.submit.when(({ identity }) => identity !== null),
		school.certificate.read.allow(),
		ecommerce.product.read.allow(),
		ecommerce.product.manage.when(({ identity }) => identity?.role === "admin"),
		ecommerce.checkout.create.allow(),
		ecommerce.checkout.webhook.allow(),
		ecommerce.discount.validate.allow(),
		ecommerce.discount.manage.when(
			({ identity }) => identity?.role === "admin",
		),
		ecommerce.order.read.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.update.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.own.when(({ identity }) => identity !== null),
		ecommerce.order.confirmation.allow(),
		featureFlags.flags.read.when(({ identity }) => identity?.role === "admin"),
		featureFlags.flags.create.when(
			({ identity }) => identity?.role === "admin",
		),
		featureFlags.flags.update.when(
			({ identity }) => identity?.role === "admin",
		),
		featureFlags.flags.toggle.when(
			({ identity }) => identity?.role === "admin",
		),
		featureFlags.flags.archive.when(
			({ identity }) => identity?.role === "admin",
		),
		featureFlags.evaluations.read.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.application.create.when(({ identity }) => identity !== null),
		affiliate.portal.read.when(({ identity }) => identity !== null),
		affiliate.portal.update.when(({ identity }) => identity !== null),
		affiliate.tracking.track.allow(),
		affiliate.affiliate.read.when(({ identity }) => identity?.role === "admin"),
		affiliate.affiliate.create.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.affiliate.update.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.affiliate.delete.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.conversion.create.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.commission.read.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.commission.update.when(
			({ identity }) => identity?.role === "admin",
		),
		affiliate.payout.read.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.create.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.update.when(({ identity }) => identity?.role === "admin"),
		affiliate.payout.export.when(({ identity }) => identity?.role === "admin"),
		analytics.events.ingest.allow(),
		analytics.dashboard.read.when(({ identity }) => identity?.role === "admin"),
		analytics.dashboard.export.when(
			({ identity }) => identity?.role === "admin",
		),
		analytics.events.cleanup.when(({ identity }) => identity?.role === "admin"),
		calendar.eventType.list.when(
			({ identity, facts }) =>
				identity !== null && (!facts.hostId || identity.id === facts.hostId),
		),
		calendar.eventType.create.when(
			({ identity, facts }) =>
				identity !== null && (!facts.hostId || identity.id === facts.hostId),
		),
		calendar.eventType.read.when(
			({ identity, facts }) => facts.public || identity?.id === facts.hostId,
		),
		calendar.eventType.update.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		calendar.eventType.delete.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		calendar.availability.read.allow(),
		calendar.booking.create.allow(),
		calendar.booking.list.when(
			({ identity, facts }) =>
				identity !== null && (!facts.hostId || identity.id === facts.hostId),
		),
		calendar.booking.read.when(
			({ identity, facts }) =>
				facts.tokenValid || identity?.id === facts.hostId,
		),
		calendar.booking.cancel.when(
			({ identity, facts }) =>
				facts.tokenValid || identity?.id === facts.hostId,
		),
		calendar.booking.remind.when(
			({ identity, facts }) => identity?.id === facts.hostId,
		),
		todos.todo.read.allow(),
		todos.todo.create.allow(),
		todos.todo.update.allow(),
		todos.todo.delete.allow(),
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
