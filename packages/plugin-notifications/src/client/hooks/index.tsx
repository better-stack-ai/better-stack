"use client";

import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import {
	notificationsResources,
	type NotificationListParams,
} from "../../query-keys";
import { NOTIFICATIONS_PLUGIN_ID } from "../constants";

const notifications = createResource({
	plugin: NOTIFICATIONS_PLUGIN_ID,
	resources: notificationsResources,
});

function useNotificationsIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}

export const useNotifications = (params: NotificationListParams = {}) => {
	const { identity, isPending, error } = useIdentity();
	return notifications.notifications.list.use(
		[params, useNotificationsIdentity()],
		{ enabled: !!identity && !isPending && !error },
	);
};
export const useSuspenseNotifications = (params: NotificationListParams = {}) =>
	notifications.notifications.list.useSuspense([
		params,
		useNotificationsIdentity(),
	]);
export const useNotificationPreferences = () =>
	notifications.notificationPreferences.list.useSuspense([
		useNotificationsIdentity(),
	]);
export const useMarkNotificationAsRead = () =>
	notifications.notifications.markAsRead.use();
export const useMarkAllNotificationsAsRead = () =>
	notifications.notifications.markAllAsRead.use();
export const useArchiveNotification = () =>
	notifications.notifications.archive.use();
export const useUpdateNotificationPreferences = () =>
	notifications.notificationPreferences.update.use();
