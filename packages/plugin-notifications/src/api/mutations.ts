import type { DBAdapter as Adapter } from "@btst/db";
import type { SendNotificationInput } from "../schemas";
import type {
	NotificationRecord,
	NotificationPreferenceRecord,
} from "../types";
import { getPreference, preferenceKey } from "./getters";

/** Bypasses validation, authorization and lifecycle hooks; callers own those checks. */
export function createNotification(
	adapter: Adapter,
	input: SendNotificationInput,
) {
	return adapter.create<NotificationRecord>({
		model: "notification",
		data: {
			...input,
			href: input.href ?? null,
			readAt: null,
			archivedAt: null,
			createdAt: new Date(),
		},
	});
}
/** Bypasses validation, authorization and lifecycle hooks; callers own those checks. */
export function markAsRead(adapter: Adapter, id: string, recipientId: string) {
	return adapter.update<NotificationRecord>({
		model: "notification",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "recipientId", value: recipientId, operator: "eq" },
		],
		update: { readAt: new Date() },
	});
}
/** Bypasses validation, authorization and lifecycle hooks; callers own those checks. */
export function archiveNotification(
	adapter: Adapter,
	id: string,
	recipientId: string,
) {
	return adapter.update<NotificationRecord>({
		model: "notification",
		where: [
			{ field: "id", value: id, operator: "eq" },
			{ field: "recipientId", value: recipientId, operator: "eq" },
		],
		update: { archivedAt: new Date() },
	});
}
/** Bypasses validation, authorization and lifecycle hooks; callers own those checks. */
export async function markAllAsRead(adapter: Adapter, recipientId: string) {
	await adapter.updateMany({
		model: "notification",
		where: [
			{ field: "recipientId", value: recipientId, operator: "eq" },
			{ field: "readAt", value: null, operator: "eq" },
			{ field: "archivedAt", value: null, operator: "eq" },
		],
		update: { readAt: new Date() },
	});
	return { success: true };
}
/** Bypasses validation, authorization and lifecycle hooks; callers own those checks. */
export async function updatePreference(
	adapter: Adapter,
	recipientId: string,
	preference: { category: string; inApp: boolean; email: boolean },
) {
	const data = { ...preference, updatedAt: new Date() };
	const existing = await getPreference(
		adapter,
		recipientId,
		preference.category,
	);
	if (existing)
		return adapter.update<NotificationPreferenceRecord>({
			model: "notificationPreference",
			where: [{ field: "id", value: existing.id, operator: "eq" }],
			update: data,
		});
	try {
		return await adapter.create<NotificationPreferenceRecord>({
			model: "notificationPreference",
			data: {
				...data,
				recipientId,
				key: preferenceKey(recipientId, preference.category),
			},
		});
	} catch (error) {
		const concurrent = await getPreference(
			adapter,
			recipientId,
			preference.category,
		);
		if (!concurrent) throw error;
		return adapter.update<NotificationPreferenceRecord>({
			model: "notificationPreference",
			where: [{ field: "id", value: concurrent.id, operator: "eq" }],
			update: data,
		});
	}
}
