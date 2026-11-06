import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	OperationHttpError,
	type DeepReadonly,
} from "@btst/stack/plugins/api";
import { notificationsPermissions as permissions } from "../permissions";
import {
	listNotificationsSchema,
	notificationIdSchema,
	recipientSchema,
	sendNotificationSchema,
	updatePreferencesSchema,
	type SendNotificationInput,
} from "../schemas";
import type { Notification, NotificationCategory } from "../types";
import * as getters from "./getters";
import * as mutations from "./mutations";
import { serializeNotification } from "./serializers";

export type NotificationDelivery = DeepReadonly<SendNotificationInput>;
export type NotificationSendResult = {
	notification: Notification | null;
	emailDelivered: boolean;
};
export type NotificationsHookContext = { readonly request?: Request };
export interface NotificationsPluginHooks {
	onBeforeSendNotification?: (
		input: NotificationDelivery,
		context: NotificationsHookContext,
	) => void | Promise<void>;
	onAfterSendNotification?: (
		result: DeepReadonly<NotificationSendResult>,
		context: NotificationsHookContext,
	) => void | Promise<void>;
	onErrorSendNotification?: (
		error: unknown,
		context: NotificationsHookContext,
	) => void | Promise<void>;
}
export interface NotificationsBackendOptions {
	categories?: NotificationCategory[];
	/** Called when the recipient enables email for this category. Own email addressing and rendering here. */
	onDeliverExternal?: (
		notification: NotificationDelivery,
		context: NotificationsHookContext,
	) => void | Promise<void>;
	emailAdapter?: {
		send: (
			notification: NotificationDelivery,
			context: NotificationsHookContext,
		) => void | Promise<void>;
	};
	hooks?: NotificationsPluginHooks;
}
function fail(status: number, message: string): never {
	throw new OperationHttpError(status, message, "NOTIFICATIONS_ERROR");
}
function recipient(context: {
	input: { recipientId?: string };
	identity: { id: string } | null;
	request?: Request;
}) {
	if (context.request) {
		if (!context.identity) fail(401, "Sign in to view notifications");
		if (
			context.input.recipientId &&
			context.input.recipientId !== context.identity.id
		)
			fail(403, "Notifications belong to another recipient");
		return context.identity.id;
	}
	return (
		context.identity?.id ??
		context.input.recipientId ??
		fail(400, "A recipientId is required for trusted notification operations")
	);
}
function ownNotification(context: {
	facts: { recipientId: string };
	identity: { id: string } | null;
	request?: Request;
}) {
	if (
		context.request &&
		(!context.identity || context.facts.recipientId !== context.identity.id)
	)
		fail(403, "Notifications belong to another recipient");
}

export function createNotificationsOperations(
	adapter: Adapter,
	options: NotificationsBackendOptions,
) {
	async function notificationFacts(id: string) {
		const record = await getters.getNotification(adapter, id);
		if (!record) fail(404, "Notification not found");
		return { id: record.id, recipientId: record.recipientId };
	}
	return {
		listNotifications: defineOperation({
			input: listNotificationsSchema,
			permission: permissions.inbox.read,
			facts: () => undefined,
			execute: (context) =>
				getters.listNotifications(adapter, recipient(context), context.input),
		}),
		getPreferences: defineOperation({
			input: recipientSchema,
			permission: permissions.preferences.read,
			facts: () => undefined,
			execute: (context) =>
				getters.getPreferences(adapter, recipient(context), options.categories),
		}),
		updatePreferences: defineOperation({
			input: updatePreferencesSchema,
			permission: permissions.preferences.update,
			facts: () => undefined,
			execute: async (context) => {
				const recipientId = recipient(context);
				for (const preference of context.input.preferences)
					await mutations.updatePreference(adapter, recipientId, preference);
				return getters.getPreferences(adapter, recipientId, options.categories);
			},
		}),
		markAllAsRead: defineOperation({
			input: recipientSchema,
			permission: permissions.inbox.markAllAsRead,
			facts: () => undefined,
			execute: (context) =>
				mutations.markAllAsRead(adapter, recipient(context)),
		}),
		markAsRead: defineOperation({
			input: notificationIdSchema,
			permission: permissions.notification.markAsRead,
			facts: ({ input }) => notificationFacts(input.id),
			before: ownNotification,
			execute: async ({ facts }) => {
				const current = await getters.getNotification(adapter, facts.id);
				if (!current) fail(404, "Notification not found");
				if (current.readAt) return serializeNotification(current);
				const updated = await mutations.markAsRead(
					adapter,
					facts.id,
					facts.recipientId,
				);
				if (!updated) fail(404, "Notification not found");
				return serializeNotification(updated);
			},
		}),
		archiveNotification: defineOperation({
			input: notificationIdSchema,
			permission: permissions.notification.archive,
			facts: ({ input }) => notificationFacts(input.id),
			before: ownNotification,
			execute: async ({ facts }) => {
				const updated = await mutations.archiveNotification(
					adapter,
					facts.id,
					facts.recipientId,
				);
				if (!updated) fail(404, "Notification not found");
				return serializeNotification(updated);
			},
		}),
		sendNotification: defineOperation({
			input: sendNotificationSchema,
			permission: permissions.notification.send,
			facts: ({ input }) => ({
				recipientId: input.recipientId,
				category: input.category,
			}),
			before: ({ input, request }) =>
				options.hooks?.onBeforeSendNotification?.(
					input,
					Object.freeze({ request }),
				),
			execute: async ({ input, request }) => {
				const preference = await getters.getPreference(
					adapter,
					input.recipientId,
					input.category,
				);
				const defaults = options.categories?.find(
					(category) => category.id === input.category,
				);
				const inApp = preference?.inApp ?? defaults?.inApp ?? true;
				const email = preference?.email ?? defaults?.email ?? false;
				const deliver =
					options.onDeliverExternal ??
					options.emailAdapter?.send.bind(options.emailAdapter);
				const notification = inApp
					? serializeNotification(
							await mutations.createNotification(adapter, input),
						)
					: null;
				if (email && deliver) await deliver(input, Object.freeze({ request }));
				return { notification, emailDelivered: !!(email && deliver) };
			},
			after: ({ result, request }) =>
				options.hooks?.onAfterSendNotification?.(
					result,
					Object.freeze({ request }),
				),
			onError: ({ error, request }) =>
				options.hooks?.onErrorSendNotification?.(
					error,
					Object.freeze({ request }),
				),
		}),
	};
}
