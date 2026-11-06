import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type { NotificationList, NotificationPreference } from "./types";

export type NotificationsIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;

export interface NotificationListParams {
	status?: "all" | "unread";
	limit?: number;
	offset?: number;
}

export type NotificationPreferenceInput = Pick<
	NotificationPreference,
	"category" | "inApp" | "email"
>;

export const notificationsResources = {
	notifications: {
		queries: {
			list: {
				path: "/notifications",
				query: (
					params: NotificationListParams = {},
					_identity?: NotificationsIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): NotificationList => data as NotificationList,
			},
		},
		mutations: {
			markAsRead: {
				path: "@post/notifications/:id/read",
				method: "POST",
				input: (id: string) => ({ params: { id }, body: {} }),
				invalidates: ["notifications"],
				refresh: false,
			},
			markAllAsRead: {
				path: "@post/notifications/read-all",
				method: "POST",
				input: (_: void) => ({ body: {} }),
				invalidates: ["notifications"],
				refresh: false,
			},
			archive: {
				path: "@post/notifications/:id/archive",
				method: "POST",
				input: (id: string) => ({ params: { id }, body: {} }),
				invalidates: ["notifications"],
				refresh: false,
			},
		},
	},
	notificationPreferences: {
		queries: {
			list: {
				path: "/notifications/preferences",
				key: (identity?: NotificationsIdentityPartition) => [identity],
				select: (data: unknown): NotificationPreference[] =>
					data as NotificationPreference[],
			},
		},
		mutations: {
			update: {
				path: "@put/notifications/preferences",
				method: "PUT",
				input: (preferences: NotificationPreferenceInput[]) => ({
					body: { preferences },
				}),
				select: (data: unknown): NotificationPreference[] =>
					data as NotificationPreference[],
				invalidates: ["notificationPreferences"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createNotificationsQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, notificationsResources, headers);
}
