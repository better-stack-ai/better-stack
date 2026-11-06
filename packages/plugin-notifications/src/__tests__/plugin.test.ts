import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	notificationsBackendPlugin,
	type NotificationsBackendOptions,
} from "../api/plugin";
import { notificationsPermissions as permissions } from "../permissions";

function setup(options: NotificationsBackendOptions = {}, allowSend = false) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [permissions],
		rules: ({ notifications }) => [
			notifications.inbox.read.allow(),
			notifications.inbox.markAllAsRead.allow(),
			notifications.preferences.read.allow(),
			notifications.preferences.update.allow(),
			notifications.notification.markAsRead.allow(),
			notifications.notification.archive.allow(),
			...(allowSend ? [notifications.notification.send.allow()] : []),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { notifications: notificationsBackendPlugin(options) },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: (request) => {
				const id = request.headers.get("x-user");
				return id ? { id } : null;
			},
		}),
	});
	const request = (
		path: string,
		method = "GET",
		body?: unknown,
		user: string | null = "alice",
	) =>
		new Request(`https://example.test/api/notifications${path}`, {
			method,
			headers: {
				...(user ? { "x-user": user } : {}),
				"content-type": "application/json",
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	return { stack, operations: stack.trusted.notifications, request };
}
const message = {
	recipientId: "alice",
	category: "updates",
	title: "A new release",
	body: "Your project is ready",
	href: "/projects/one",
};

describe("notification operations", () => {
	it("routes each channel using persisted per-category preferences and configured defaults", async () => {
		const deliver = vi.fn();
		const { operations } = setup({
			categories: [
				{ id: "updates", inApp: true, email: false },
				{ id: "billing", email: true },
			],
			onDeliverExternal: deliver,
		});
		const first = await operations.sendNotification(message);
		expect(first.notification?.title).toBe(message.title);
		expect(first.emailDelivered).toBe(false);
		expect(deliver).not.toHaveBeenCalled();
		await operations.updatePreferences({
			recipientId: "alice",
			preferences: [{ category: "updates", inApp: false, email: true }],
		});
		expect(await operations.sendNotification(message)).toEqual({
			notification: null,
			emailDelivered: true,
		});
		expect(deliver).toHaveBeenCalledTimes(1);
		await operations.updatePreferences({
			recipientId: "alice",
			preferences: [{ category: "updates", inApp: false, email: false }],
		});
		expect(await operations.sendNotification(message)).toEqual({
			notification: null,
			emailDelivered: false,
		});
		expect(deliver).toHaveBeenCalledTimes(1);
		await operations.updatePreferences({
			recipientId: "alice",
			preferences: [{ category: "updates", inApp: true, email: true }],
		});
		const dual = await operations.sendNotification(message);
		expect(dual.notification).not.toBeNull();
		expect(dual.emailDelivered).toBe(true);
		expect(
			(await operations.listNotifications({ recipientId: "alice" })).total,
		).toBe(2);
		expect(await operations.getPreferences({ recipientId: "alice" })).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					category: "billing",
					inApp: true,
					email: true,
				}),
				expect.objectContaining({
					category: "updates",
					inApp: true,
					email: true,
				}),
			]),
		);
	});

	it("normalizes configured category IDs and preserves email adapter method context", async () => {
		const adapter = {
			sent: [] as string[],
			async send(input: { recipientId: string }) {
				this.sent.push(input.recipientId);
			},
		};
		const { operations } = setup({
			categories: [{ id: " updates ", inApp: false, email: true }],
			emailAdapter: adapter,
		});
		expect(await operations.sendNotification(message)).toEqual({
			notification: null,
			emailDelivered: true,
		});
		expect(adapter.sent).toEqual(["alice"]);
		expect(
			(await operations.getPreferences({ recipientId: "alice" }))[0],
		).toMatchObject({ category: "updates", inApp: false, email: true });
	});

	it("scopes lists, reads, archives and preferences to the authenticated recipient even under permissive rules", async () => {
		const { operations, stack, request } = setup({
			categories: [{ id: "updates" }],
		});
		const alice = (await operations.sendNotification(message)).notification!;
		const bob = (
			await operations.sendNotification({ ...message, recipientId: "bob" })
		).notification!;
		expect(
			(
				await (await stack.handler(request("?recipientId=bob"))).json()
			).items.map((item: { id: string }) => item.id),
		).toEqual([alice.id]);
		expect(
			(await stack.handler(request(`/${bob.id}/read`, "POST"))).status,
		).toBe(403);
		expect(
			(await stack.handler(request(`/${bob.id}/archive`, "POST"))).status,
		).toBe(403);
		const changed = await stack.handler(
			request("/preferences", "PUT", {
				recipientId: "bob",
				preferences: [{ category: "updates", inApp: false, email: false }],
			}),
		);
		expect(changed.status).toBe(200);
		expect(
			(await operations.getPreferences({ recipientId: "bob" }))[0]?.inApp,
		).toBe(true);
		expect(
			(await operations.getPreferences({ recipientId: "alice" }))[0]?.inApp,
		).toBe(false);
		await expect(
			stack
				.forRequest(request(""))
				.operations.notifications.listNotifications({ recipientId: "bob" }),
		).rejects.toThrow(/another recipient/);
		await expect(
			stack
				.forRequest(request(""))
				.operations.notifications.getPreferences({ recipientId: "bob" }),
		).rejects.toThrow(/another recipient/);
		await expect(
			stack.forRequest(request("")).operations.notifications.updatePreferences({
				recipientId: "bob",
				preferences: [],
			}),
		).rejects.toThrow(/another recipient/);
		expect(
			(await operations.listNotifications({ recipientId: "bob" })).unreadCount,
		).toBe(1);
		expect(
			(await operations.listNotifications({ recipientId: "bob" })).items[0]
				?.archivedAt,
		).toBeNull();
	});

	it("denies anonymous and unauthorized sends before lifecycle or delivery side effects", async () => {
		const deliver = vi.fn();
		const before = vi.fn();
		const { operations, stack, request } = setup({
			onDeliverExternal: deliver,
			hooks: { onBeforeSendNotification: before },
			categories: [{ id: "updates", email: true }],
		});
		expect(
			(await stack.handler(request("", "GET", undefined, null))).status,
		).toBe(401);
		expect(
			(await stack.handler(request("/send", "POST", message))).status,
		).toBe(403);
		expect(before).not.toHaveBeenCalled();
		expect(deliver).not.toHaveBeenCalled();
		expect(
			(await operations.listNotifications({ recipientId: "alice" })).total,
		).toBe(0);
	});

	it("marks only active own notifications read and excludes archives from inbox counts", async () => {
		const { operations, stack, request } = setup();
		const first = (await operations.sendNotification(message)).notification!;
		const second = (await operations.sendNotification(message)).notification!;
		await operations.sendNotification({ ...message, recipientId: "bob" });
		expect(
			(await stack.handler(request(`/${first.id}/read`, "POST"))).status,
		).toBe(200);
		expect(
			(
				await operations.listNotifications({
					recipientId: "alice",
					status: "unread",
				})
			).items.map((item) => item.id),
		).toEqual([second.id]);
		expect(
			(await stack.handler(request(`/${first.id}/archive`, "POST"))).status,
		).toBe(200);
		expect((await stack.handler(request("/read-all", "POST"))).status).toBe(
			200,
		);
		expect(
			await operations.listNotifications({ recipientId: "alice", limit: 1 }),
		).toMatchObject({ total: 1, unreadCount: 0 });
		expect(
			(await operations.listNotifications({ recipientId: "bob" })).unreadCount,
		).toBe(1);
	});

	it("validates trusted input and hrefs before writing or delivering", async () => {
		const deliver = vi.fn();
		const { operations } = setup({ onDeliverExternal: deliver });
		for (const href of ["javascript:alert(1)", "//evil.test", "/\\evil.test"])
			await expect(
				operations.sendNotification({ ...message, href }),
			).rejects.toThrow();
		await expect(
			operations.updatePreferences({
				recipientId: "alice",
				preferences: [
					{ category: "updates", inApp: true, email: false },
					{ category: "updates", inApp: false, email: true },
				],
			}),
		).rejects.toThrow();
		await expect(
			operations.listNotifications({ recipientId: "alice", limit: 0 }),
		).rejects.toThrow();
		expect(
			(await operations.listNotifications({ recipientId: "alice" })).total,
		).toBe(0);
		expect(deliver).not.toHaveBeenCalled();
	});
});
