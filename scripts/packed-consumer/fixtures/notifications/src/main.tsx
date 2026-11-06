import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { notificationsClientPlugin } from "@btst/plugin-notifications/client";
import { NotificationBell } from "@btst/plugin-notifications/client/components";
import { notificationsPermissions } from "@btst/plugin-notifications/permissions";
import type {
	Notification,
	NotificationPreference,
} from "@btst/plugin-notifications/types";
import "@btst/plugin-notifications/css";
import { z } from "zod";
const notification: Notification = {
	id: "packed-notification",
	recipientId: "alice",
	category: "updates",
	title: "Packed notification",
	body: "Your export is ready.",
	href: null,
	readAt: null,
	archivedAt: null,
	createdAt: "2026-11-06T00:00:00.000Z",
};
let records = [notification];
let preferences: NotificationPreference[] = [
	{
		id: "alice-updates",
		recipientId: "alice",
		category: "updates",
		inApp: true,
		email: false,
		updatedAt: "2026-11-06T00:00:00.000Z",
	},
];
globalThis.fetch = async (input, init) => {
	const request =
		input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	if (url.pathname.endsWith("/preferences")) {
		if (request.method === "PUT") {
			const body = await request.json();
			preferences = body.preferences.map((value: NotificationPreference) => ({
				...preferences[0],
				...value,
			}));
		}
		return Response.json(preferences);
	}
	if (request.method === "POST") {
		if (url.pathname.endsWith("/read-all") || url.pathname.endsWith("/read"))
			records = records.map((record) => ({
				...record,
				readAt: new Date().toISOString(),
			}));
		if (url.pathname.endsWith("/archive")) records = [];
		return Response.json(records[0] ?? notification);
	}
	return Response.json({
		items: records,
		total: records.length,
		unreadCount: records.filter((record) => !record.readAt).length,
	});
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: {
		notifications: notificationsClientPlugin({
			identityPartition: { id: "alice" },
		}),
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [notificationsPermissions],
	rules: ({ notifications }) => [
		notifications.inbox.read.allow(),
		notifications.inbox.markAllAsRead.allow(),
		notifications.preferences.read.allow(),
		notifications.preferences.update.allow(),
		notifications.notification.markAsRead.allow(),
		notifications.notification.archive.allow(),
	],
});
const Inbox = stack.router.getRoute("/notifications")!.PageComponent!;
const Preferences = stack.router.getRoute("/notifications/preferences")!
	.PageComponent!;
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "alice" }),
			})}
			initialIdentity={{ id: "alice" }}
		>
			<NotificationBell />
			<Suspense fallback={<p>Loading notifications</p>}>
				<Inbox />
				<Preferences />
			</Suspense>
		</StackProvider>
	</QueryClientProvider>,
);
