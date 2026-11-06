import type { DBAdapter as Adapter } from "@btst/db";
import type { z } from "zod";
import type { listNotificationsSchema } from "../schemas";
import type {
	NotificationCategory,
	NotificationRecord,
	NotificationPreferenceRecord,
	NotificationPreference,
} from "../types";
import { serializeNotification, serializePreference } from "./serializers";

/** Lower-level reads; callers own validation and authorization. */
export function getNotification(adapter: Adapter, id: string) {
	return adapter.findOne<NotificationRecord>({
		model: "notification",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export async function listNotifications(
	adapter: Adapter,
	recipientId: string,
	query: z.output<typeof listNotificationsSchema>,
) {
	const active = [
		{ field: "recipientId", value: recipientId, operator: "eq" as const },
		{ field: "archivedAt", value: null, operator: "eq" as const },
	];
	const unread = [
		...active,
		{ field: "readAt", value: null, operator: "eq" as const },
	];
	const where = query.status === "unread" ? unread : active;
	const [items, total, unreadCount] = await Promise.all([
		adapter.findMany<NotificationRecord>({
			model: "notification",
			where,
			limit: query.limit,
			offset: query.offset,
			sortBy: { field: "createdAt", direction: "desc" },
		}),
		adapter.count({ model: "notification", where }),
		adapter.count({ model: "notification", where: unread }),
	]);
	return { items: items.map(serializeNotification), total, unreadCount };
}
export function preferenceKey(recipientId: string, category: string) {
	return JSON.stringify([recipientId, category]);
}
export function getPreference(
	adapter: Adapter,
	recipientId: string,
	category: string,
) {
	return adapter.findOne<NotificationPreferenceRecord>({
		model: "notificationPreference",
		where: [
			{
				field: "key",
				value: preferenceKey(recipientId, category),
				operator: "eq",
			},
		],
	});
}
export async function getPreferences(
	adapter: Adapter,
	recipientId: string,
	categories: readonly NotificationCategory[] = [],
) {
	const rows: NotificationPreference[] = [];
	for (let offset = 0; ; offset += 100) {
		const batch = await adapter.findMany<NotificationPreferenceRecord>({
			model: "notificationPreference",
			where: [{ field: "recipientId", value: recipientId, operator: "eq" }],
			offset,
			limit: 100,
			sortBy: { field: "category", direction: "asc" },
		});
		rows.push(...batch.map(serializePreference));
		if (batch.length < 100) break;
	}
	for (const category of categories) {
		if (!rows.some((row) => row.category === category.id))
			rows.push({
				id: preferenceKey(recipientId, category.id),
				recipientId,
				category: category.id,
				inApp: category.inApp ?? true,
				email: category.email ?? false,
				updatedAt: new Date(0).toISOString(),
			});
	}
	return rows.sort((a, b) => a.category.localeCompare(b.category));
}
