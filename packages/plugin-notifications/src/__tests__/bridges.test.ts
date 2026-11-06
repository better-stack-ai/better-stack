import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	commentsBackendPlugin,
	getCommentById,
	type CommentsBackendHooks,
} from "../../../plugin-comments/src/api";
import {
	kanbanBackendPlugin,
	type KanbanBackendHooks,
} from "../../../plugin-kanban/src/api";
import {
	calendarBackendPlugin,
	type CalendarBackendHooks,
} from "../../../plugin-calendar/src/api";
import {
	feedbackBackendPlugin,
	getFeedbackVoterIds,
	type FeedbackBackendHooks,
} from "../../../plugin-feedback/src/api";
import {
	helpdeskBackendPlugin,
	type HelpdeskBackendHooks,
} from "../../../plugin-helpdesk/src/api";
import { helpdeskPermissions } from "../../../plugin-helpdesk/src/permissions";
import { notificationsBackendPlugin } from "../api/plugin";
import {
	createCommentsNotificationHooks,
	createKanbanNotificationHooks,
	createCalendarNotificationHooks,
	createFeedbackNotificationHooks,
	createHelpdeskNotificationHooks,
	type NotificationSender,
} from "../api/bridges";

function serializedMemoryAdapter(db: DatabaseDefinition): DBAdapter {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	const lock = async <T>(run: () => Promise<T>): Promise<T> => {
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	};
	return {
		...adapter,
		id: "serialized-memory-test",
		create: ((input) =>
			lock(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			lock(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			lock(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => lock(() => adapter.count(input)),
		update: ((input) =>
			lock(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => lock(() => adapter.updateMany(input)),
		delete: ((input) =>
			lock(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => lock(() => adapter.deleteMany(input)),
		incrementOne: ((input) =>
			lock(() => adapter.incrementOne(input))) as DBAdapter["incrementOne"],
		transaction: ((callback) =>
			lock(() => adapter.transaction(callback))) as DBAdapter["transaction"],
	};
}

function setup(autoApprove = false) {
	const deliver = vi.fn();
	const sendNotification: NotificationSender = (input): Promise<unknown> =>
		stack.trusted.notifications.sendNotification(input);
	const comments = createCommentsNotificationHooks({
		sendNotification,
		getParentAuthorId: async (id) =>
			(await getCommentById(stack.adapter, id))?.authorId ?? null,
	}) satisfies CommentsBackendHooks;
	const kanban = createKanbanNotificationHooks({
		sendNotification,
	}) satisfies KanbanBackendHooks;
	const calendar = createCalendarNotificationHooks({
		sendNotification,
		resolveAttendeeId: () => "attendee",
	}) satisfies CalendarBackendHooks;
	const feedback = createFeedbackNotificationHooks({
		sendNotification,
		getVoterIds: (id): Promise<string[]> =>
			getFeedbackVoterIds(stack.adapter, id),
	}) satisfies FeedbackBackendHooks;
	const helpdesk = createHelpdeskNotificationHooks({
		sendNotification,
	}) satisfies HelpdeskBackendHooks;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [helpdeskPermissions],
		rules: () => [],
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: {
			notifications: notificationsBackendPlugin({ onDeliverExternal: deliver }),
			comments: commentsBackendPlugin({ autoApprove, hooks: comments }),
			kanban: kanbanBackendPlugin({ hooks: kanban }),
			calendar: calendarBackendPlugin({ hooks: calendar }),
			feedback: feedbackBackendPlugin({ hooks: feedback }),
			helpdesk: helpdeskBackendPlugin({ hooks: helpdesk }),
		},
		adapter: (db) => serializedMemoryAdapter(db),
		auth: createServerAuth({ authorization, getIdentity: () => null }),
	});
	return {
		stack,
		deliver,
		ops: stack.trusted,
		inbox: (recipientId: string) =>
			stack.trusted.notifications.listNotifications({ recipientId }),
	};
}

describe("notification lifecycle bridges", () => {
	it("emits only approved replies to the parent author, honoring preferences across channels", async () => {
		const { ops, inbox, deliver } = setup();
		const parent = await ops.comments.createComment({
			resourceId: "post",
			resourceType: "blog",
			body: "Parent",
			authorId: "parent",
		});
		await ops.comments.updateCommentStatus({
			id: parent.id,
			data: { status: "approved" },
		});
		const reply = await ops.comments.createComment({
			resourceId: "post",
			resourceType: "blog",
			parentId: parent.id,
			body: "Reply",
			authorId: "reply-author",
		});
		expect((await inbox("parent")).total).toBe(0);
		await ops.notifications.updatePreferences({
			recipientId: "parent",
			preferences: [{ category: "comments", inApp: false, email: true }],
		});
		await ops.comments.updateCommentStatus({
			id: reply.id,
			data: { status: "approved" },
		});
		expect((await inbox("parent")).total).toBe(0);
		expect(deliver).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				recipientId: "parent",
				category: "comments",
				body: "Reply",
			}),
			expect.anything(),
		);
		await ops.comments.updateCommentStatus({
			id: reply.id,
			data: { status: "approved" },
		});
		await ops.comments.updateComment({
			id: reply.id,
			data: { body: "Edited" },
		});
		expect(deliver).toHaveBeenCalledTimes(1);
	});

	it("notifies auto-approved replies but skips self replies", async () => {
		const { ops, inbox } = setup(true);
		const parent = await ops.comments.createComment({
			resourceId: "post",
			resourceType: "blog",
			body: "Parent",
			authorId: "parent",
		});
		await ops.comments.createComment({
			resourceId: "post",
			resourceType: "blog",
			parentId: parent.id,
			body: "Self",
			authorId: "parent",
		});
		await ops.comments.createComment({
			resourceId: "post",
			resourceType: "blog",
			parentId: parent.id,
			body: "Approved reply",
			authorId: "other",
		});
		expect((await inbox("parent")).items).toEqual([
			expect.objectContaining({ body: "Approved reply" }),
		]);
	});

	it("notifies each new task assignee once and ignores unchanged assignment, move, reorder and unassignment", async () => {
		const { ops, inbox } = setup();
		const board = await ops.kanban.createBoard({ name: "Board" });
		const column = await ops.kanban.createColumn({
			boardId: board.id,
			title: "Todo",
		});
		const other = await ops.kanban.createColumn({
			boardId: board.id,
			title: "Done",
		});
		const task = await ops.kanban.createTask({
			columnId: column.id,
			title: "Task",
			assigneeId: "alice",
		});
		await ops.kanban.updateTask({
			id: task.id,
			data: { title: "Renamed", assigneeId: "alice" },
		});
		await ops.kanban.moveTask({
			taskId: task.id,
			targetColumnId: other.id,
			targetOrder: 0,
		});
		await ops.kanban.reorderTasks({ columnId: other.id, taskIds: [task.id] });
		expect((await inbox("alice")).total).toBe(1);
		await ops.kanban.updateTask({ id: task.id, data: { assigneeId: "bob" } });
		await ops.kanban.updateTask({ id: task.id, data: { assigneeId: null } });
		expect((await inbox("bob")).total).toBe(1);
	});

	it("notifies booking host and attendee for confirmation, reschedule and cancellation, without leaking bearer tokens", async () => {
		const { ops, inbox } = setup();
		const event = await ops.calendar.createEventType({
			hostId: "host",
			slug: "meeting",
			name: "Meeting",
			duration: 30,
			timezone: "UTC",
			weeklyAvailability: [{ dayOfWeek: 1, start: "09:00", end: "12:00" }],
		});
		const booking = await ops.calendar.createBooking({
			slug: event.slug,
			start: "2030-01-07T09:00:00Z",
			timezone: "UTC",
			name: "Attendee",
			email: "attendee@example.test",
		});
		await ops.calendar.rescheduleBooking({
			id: booking.id,
			token: booking.cancelToken,
			start: "2030-01-07T10:00:00Z",
			timezone: "UTC",
		});
		await ops.calendar.cancelBooking({
			id: booking.id,
			token: booking.cancelToken,
		});
		for (const recipientId of ["host", "attendee"]) {
			const result = await inbox(recipientId);
			expect(result.total).toBe(3);
			expect(new Set(result.items.map((item) => item.title))).toEqual(
				new Set([
					"Booking confirmed",
					"Booking rescheduled",
					"Booking cancelled",
				]),
			);
			expect(JSON.stringify(result)).not.toContain(booking.cancelToken);
		}
	});

	it("deduplicates a host attending their own booking and skips unmatched attendees", async () => {
		const booking = {
			id: "booking",
			hostId: "host",
			eventName: "Meeting",
			email: "host@example.test",
			name: "Host",
			start: "2030-01-07T09:00:00Z",
			end: "2030-01-07T09:30:00Z",
			timezone: "UTC",
		};
		for (const attendeeId of [null, "host"]) {
			const sendNotification = vi.fn();
			const hooks = createCalendarNotificationHooks({
				sendNotification,
				resolveAttendeeId: () => attendeeId,
			});
			await hooks.onAfterConfirmBooking(booking);
			expect(sendNotification).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ recipientId: "host" }),
			);
		}
	});

	it("notifies every voter beyond one page only on status transitions, honoring disabled preferences", async () => {
		const { ops, inbox } = setup();
		const post = await ops.feedback.createPost({
			title: "Request",
			body: "Details",
			authorId: "author",
		});
		for (let i = 0; i < 102; i++)
			await ops.feedback.toggleVote({ id: post.id, userId: `voter-${i}` });
		await ops.notifications.updatePreferences({
			recipientId: "voter-0",
			preferences: [{ category: "feedback", inApp: false, email: false }],
		});
		await ops.feedback.updatePostStatus({ id: post.id, status: "planned" });
		await ops.feedback.updatePostStatus({ id: post.id, status: "planned" });
		expect((await inbox("voter-0")).total).toBe(0);
		for (let i = 1; i < 102; i++)
			expect((await inbox(`voter-${i}`)).total).toBe(1);
		expect((await inbox("author")).total).toBe(0);
	});

	it("notifies assigned agents and requesters after committed helpdesk events, excluding internal notes", async () => {
		const { ops, inbox } = setup();
		const ticket = await ops.helpdesk.createTicket({
			subject: "Support",
			body: "Help",
			customerId: "customer",
		});
		await ops.helpdesk.updateTicket({
			id: ticket.id,
			data: { assigneeId: "agent" },
		});
		await ops.helpdesk.updateTicket({
			id: ticket.id,
			data: { assigneeId: "agent" },
		});
		await ops.helpdesk.replyToTicket({
			id: ticket.id,
			customerId: "customer",
			body: "More information",
		});
		expect((await inbox("agent")).total).toBe(2);
		await ops.helpdesk.replyAsAgent({
			id: ticket.id,
			body: "Secret note",
			isInternalNote: true,
			authorId: "agent",
		});
		expect((await inbox("customer")).total).toBe(0);
		await ops.helpdesk.replyAsAgent({
			id: ticket.id,
			body: "Public reply",
			isInternalNote: false,
			authorId: "agent",
		});
		await ops.helpdesk.updateTicket({
			id: ticket.id,
			data: { status: "resolved" },
		});
		await ops.helpdesk.updateTicket({
			id: ticket.id,
			data: { status: "resolved" },
		});
		const customer = await inbox("customer");
		expect(customer.total).toBe(2);
		expect(JSON.stringify(customer)).not.toContain("Secret note");
	});
});
