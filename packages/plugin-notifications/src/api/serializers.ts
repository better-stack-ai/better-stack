import type {
	NotificationRecord,
	NotificationPreferenceRecord,
	Notification,
	NotificationPreference,
} from "../types";

export function serializeNotification(row: NotificationRecord): Notification {
	return {
		...row,
		href: row.href ?? null,
		readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
		archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
		createdAt: new Date(row.createdAt).toISOString(),
	};
}
export function serializePreference(
	row: NotificationPreferenceRecord,
): NotificationPreference {
	return {
		id: row.id,
		recipientId: row.recipientId,
		category: row.category,
		inApp: row.inApp,
		email: row.email,
		updatedAt: new Date(row.updatedAt).toISOString(),
	};
}
