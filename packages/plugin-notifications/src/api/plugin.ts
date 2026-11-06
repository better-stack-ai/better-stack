import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { z } from "zod";
import { notificationsSchema } from "../db";
import {
	listNotificationsSchema,
	sendNotificationSchema,
	updatePreferencesSchema,
} from "../schemas";
import {
	createNotificationsOperations,
	type NotificationsBackendOptions,
} from "./operations";

export const notificationsBackendPlugin = (
	options: NotificationsBackendOptions = {},
) => {
	const categories = z
		.array(
			z.object({
				id: z.string().trim().min(1).max(100),
				label: z.string().optional(),
				inApp: z.boolean().optional(),
				email: z.boolean().optional(),
			}),
		)
		.refine(
			(categories) =>
				new Set(categories.map((category) => category.id)).size ===
				categories.length,
			"Category IDs must be unique",
		)
		.parse(options.categories ?? []);
	if (options.emailAdapter && options.onDeliverExternal)
		throw new TypeError(
			"Configure emailAdapter or onDeliverExternal, not both",
		);
	return defineBackendPlugin({
		id: "notifications",
		dbPlugin: notificationsSchema,
		operations: (adapter) =>
			createNotificationsOperations(adapter, { ...options, categories }),
		routes: (_adapter, _context, operations) => ({
			listNotifications: createEndpoint(
				"/notifications",
				{
					method: "GET",
					query: listNotificationsSchema.omit({ recipientId: true }),
					requireRequest: true,
				},
				operations.listNotifications.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			getPreferences: createEndpoint(
				"/notifications/preferences",
				{ method: "GET", requireRequest: true },
				operations.getPreferences.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return {};
				}),
			),
			updatePreferences: createEndpoint(
				"/notifications/preferences",
				{
					method: "PUT",
					body: updatePreferencesSchema.omit({ recipientId: true }),
					requireRequest: true,
				},
				operations.updatePreferences.route((ctx) => ctx.body),
			),
			markAllAsRead: createEndpoint(
				"/notifications/read-all",
				{ method: "POST", requireRequest: true },
				operations.markAllAsRead.route(() => ({})),
			),
			markAsRead: createEndpoint(
				"/notifications/:id/read",
				{ method: "POST", requireRequest: true },
				operations.markAsRead.route((ctx) => ({ id: ctx.params.id })),
			),
			archiveNotification: createEndpoint(
				"/notifications/:id/archive",
				{ method: "POST", requireRequest: true },
				operations.archiveNotification.route((ctx) => ({ id: ctx.params.id })),
			),
			sendNotification: createEndpoint(
				"/notifications/send",
				{ method: "POST", body: sendNotificationSchema, requireRequest: true },
				operations.sendNotification.route((ctx) => ctx.body),
			),
		}),
	});
};
export type NotificationsApiRouter = ReturnType<
	ReturnType<typeof notificationsBackendPlugin>["routes"]
>;
export type { NotificationsBackendOptions } from "./operations";
