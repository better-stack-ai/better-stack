import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as notifications from "@btst/plugin-notifications/api";
import * as permissions from "@btst/plugin-notifications/permissions";
import { notificationsClientPlugin } from "@btst/plugin-notifications/client";
import { createClientStack } from "@btst/stack/client";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { z } from "zod";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("@btst/plugin-blog/api"), {
	code: "MODULE_NOT_FOUND",
});
assert.throws(() => require.resolve("@btst/components"), {
	code: "MODULE_NOT_FOUND",
});
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	notificationsBackendPlugin,
	notificationsPermissions,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
		permissions: [notificationsPermissions],
		rules: ({ notifications }) => [
			notifications.inbox.read.when(({ identity }) => identity !== null),
			notifications.inbox.markAllAsRead.when(
				({ identity }) => identity !== null,
			),
			notifications.preferences.read.when(({ identity }) => identity !== null),
			notifications.preferences.update.when(
				({ identity }) => identity !== null,
			),
			notifications.notification.markAsRead.when(
				({ identity, facts }) => identity?.id === facts.recipientId,
			),
			notifications.notification.archive.when(
				({ identity, facts }) => identity?.id === facts.recipientId,
			),
			notifications.notification.send.when(
				({ identity }) => identity?.role === "admin",
			),
		],
	});
	const delivered = [];
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id, role: "user" } : null;
			},
		}),
		plugins: {
			notifications: notificationsBackendPlugin({
				categories: [{ id: "updates" }],
				onDeliverExternal: (value) => {
					delivered.push(value);
				},
			}),
		},
	});
	const request = (path, method = "GET", body, user = "alice") =>
		stack.handler(
			new Request(`https://example.test/api${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	const sent = await stack.trusted.notifications.sendNotification({
		recipientId: "alice",
		category: "updates",
		title: "Packed notification",
		body: "Your export is ready.",
	});
	assert.equal(sent.notification.title, "Packed notification");
	assert.equal(sent.emailDelivered, false);
	assert.ok(
		[401, 403].includes(
			(await request("/notifications", "GET", undefined, "")).status,
		),
	);
	const inbox = await (await request("/notifications")).json();
	assert.equal(inbox.unreadCount, 1);
	assert.equal(inbox.items[0].recipientId, "alice");
	assert.equal(
		(await (await request("/notifications", "GET", undefined, "bob")).json())
			.total,
		0,
	);
	assert.equal(
		(
			await request(
				`/notifications/${sent.notification.id}/read`,
				"POST",
				{},
				"bob",
			)
		).status,
		403,
	);
	assert.equal(
		(await request(`/notifications/${sent.notification.id}/read`, "POST", {}))
			.status,
		200,
	);
	assert.equal((await (await request("/notifications")).json()).unreadCount, 0);
	assert.equal(
		(
			await request("/notifications/preferences", "PUT", {
				preferences: [{ category: "updates", inApp: false, email: true }],
			})
		).status,
		200,
	);
	const external = await stack.trusted.notifications.sendNotification({
		recipientId: "alice",
		category: "updates",
		title: "Email only",
		body: "Sent externally",
	});
	assert.equal(external.notification, null);
	assert.equal(external.emailDelivered, true);
	assert.equal(delivered.length, 1);
	assert.equal(
		(
			await request("/notifications/send", "POST", {
				recipientId: "bob",
				category: "updates",
				title: "Denied",
				body: "Denied",
			})
		).status,
		403,
	);
	const archived = await request(
		`/notifications/${sent.notification.id}/archive`,
		"POST",
		{},
	);
	assert.equal(archived.status, 200);
	assert.equal((await (await request("/notifications")).json()).total, 0);
	return { stack, request };
}
const { stack } = await verify({
	...core,
	...auth,
	...server,
	...notifications,
	...permissions,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-notifications/api"),
	...require("@btst/plugin-notifications/permissions"),
});
assert.equal(
	require("@btst/plugin-notifications/client").notificationsClientPlugin().id,
	"notifications",
);
const queryClient = new QueryClient();
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
	stack.handler(input instanceof Request ? input : new Request(input, init));
try {
	const client = createClientStack({
		api: {
			baseURL: "https://example.test",
			basePath: "/api",
			headers: { "x-user": "alice" },
		},
		site: { baseURL: "https://example.test", basePath: "/pages" },
		queryClient,
		plugins: {
			notifications: notificationsClientPlugin({
				identityPartition: { id: "alice" },
			}),
		},
	});
	for (const path of ["/notifications", "/notifications/preferences"])
		await client.router.getRoute(path).loader();
	assert.equal(dehydrate(queryClient).queries.length, 2);
} finally {
	globalThis.fetch = originalFetch;
}
