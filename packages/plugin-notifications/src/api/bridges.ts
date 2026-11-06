import type { SendNotificationInput } from "../schemas";

/** Route bridge deliveries through the trusted Notifications send operation to honor preferences. */
export type NotificationSender = (
	input: SendNotificationInput,
) => unknown | Promise<unknown>;

type BridgeOptions = { sendNotification: NotificationSender };
type CommentReply = Readonly<{
	id: string;
	parentId: string | null;
	authorId: string;
	body: string;
	status: string;
}>;
type AssignedTask = Readonly<{
	id: string;
	title: string;
	assigneeId?: string | null;
}>;
/** Public booking fields needed to resolve an attendee's application user ID. */
export type NotificationBooking = Readonly<{
	id: string;
	hostId: string;
	eventName: string;
	email: string;
	name: string;
	start: string;
	end: string;
	timezone: string;
}>;
type FeedbackPost = Readonly<{ id: string; title: string; status: string }>;
type SupportTicket = Readonly<{
	id: string;
	subject: string;
	status: string;
	customerId: string;
	assigneeId: string | null;
}>;

/** Notify a parent author when a reply is created approved or transitions to approved. */
export function createCommentsNotificationHooks(
	options: BridgeOptions & {
		getParentAuthorId: (
			parentId: string,
		) => string | null | Promise<string | null>;
	},
) {
	async function notify(comment: CommentReply) {
		if (!comment.parentId || comment.status !== "approved") return;
		const recipientId = await options.getParentAuthorId(comment.parentId);
		if (!recipientId || recipientId === comment.authorId) return;
		await options.sendNotification({
			recipientId,
			category: "comments",
			title: "New reply to your comment",
			body: comment.body.slice(0, 10000),
		});
	}
	return {
		onAfterCreateComment: notify,
		onAfterApproveComment: async (
			comment: CommentReply,
			context: { readonly facts: { readonly currentStatus: string } },
		) => {
			if (context.facts.currentStatus !== "approved") await notify(comment);
		},
	};
}

/** Notify the new assignee on task creation or an assignment change. */
export function createKanbanNotificationHooks(options: BridgeOptions) {
	async function notify(task: AssignedTask) {
		if (!task.assigneeId) return;
		await options.sendNotification({
			recipientId: task.assigneeId,
			category: "kanban",
			title: "Task assigned to you",
			body: task.title.slice(0, 10000),
		});
	}
	return {
		onAfterCreateTask: notify,
		onAfterUpdateTask: async (
			task: AssignedTask,
			context: {
				readonly input: object;
				readonly facts: {
					readonly boardId: string;
					readonly assigneeId?: string;
				};
			},
		) => {
			const input = context.input;
			if (
				"data" in input &&
				input.data &&
				typeof input.data === "object" &&
				"assigneeId" in input.data &&
				task.assigneeId !== context.facts.assigneeId
			)
				await notify(task);
		},
	};
}

/** Notify the host and resolved attendee without treating an email address as a user ID. */
export function createCalendarNotificationHooks(
	options: BridgeOptions & {
		resolveAttendeeId: (
			booking: NotificationBooking,
		) => string | null | Promise<string | null>;
	},
) {
	async function notify(booking: NotificationBooking, event: string) {
		const attendeeId = await options.resolveAttendeeId(booking);
		for (const recipientId of new Set([booking.hostId, attendeeId])) {
			if (!recipientId) continue;
			await options.sendNotification({
				recipientId,
				category: "calendar",
				title: `Booking ${event}`,
				body: `${booking.eventName}: ${booking.start}`.slice(0, 10000),
			});
		}
	}
	return {
		onAfterConfirmBooking: async (
			booking: NotificationBooking,
			context?: { readonly reason?: "rescheduled" },
		) => {
			if (context?.reason !== "rescheduled") await notify(booking, "confirmed");
		},
		onAfterRescheduleBooking: async (booking: NotificationBooking) =>
			notify(booking, "rescheduled"),
		onAfterCancelBooking: async (booking: NotificationBooking) =>
			notify(booking, "cancelled"),
	};
}

/** Notify each current voter once when a feedback post's status changes. */
export function createFeedbackNotificationHooks(
	options: BridgeOptions & {
		getVoterIds: (
			postId: string,
		) => readonly string[] | Promise<readonly string[]>;
	},
) {
	return {
		onAfterUpdatePostStatus: async (
			post: FeedbackPost,
			previousStatus: string,
		) => {
			if (post.status === previousStatus) return;
			for (const recipientId of new Set(await options.getVoterIds(post.id))) {
				await options.sendNotification({
					recipientId,
					category: "feedback",
					title: "Feedback status updated",
					body: `${post.title}: ${post.status}`.slice(0, 10000),
				});
			}
		},
	};
}

/** Notify agents about assignments/customer messages and requesters about public replies/resolution. */
export function createHelpdeskNotificationHooks(options: BridgeOptions) {
	async function notify(
		ticket: SupportTicket,
		recipientId: string,
		title: string,
	) {
		await options.sendNotification({
			recipientId,
			category: "helpdesk",
			title,
			body: ticket.subject.slice(0, 10000),
		});
	}
	return {
		onAfterUpdateTicket: async (
			ticket: SupportTicket,
			previous: SupportTicket,
		) => {
			if (ticket.assigneeId && ticket.assigneeId !== previous.assigneeId)
				await notify(
					ticket,
					ticket.assigneeId,
					"Support ticket assigned to you",
				);
			if (ticket.status === "resolved" && previous.status !== "resolved")
				await notify(
					ticket,
					ticket.customerId,
					"Your support ticket was resolved",
				);
		},
		onAfterCreateMessage: async (
			ticket: SupportTicket,
			message: {
				readonly authorType: "customer" | "agent";
				readonly isInternalNote: boolean;
			},
		) => {
			if (message.isInternalNote) return;
			if (message.authorType === "customer") {
				if (ticket.assigneeId)
					await notify(ticket, ticket.assigneeId, "New customer message");
			} else
				await notify(
					ticket,
					ticket.customerId,
					"New reply to your support ticket",
				);
		},
	};
}
