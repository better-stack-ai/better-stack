export {
	notificationsBackendPlugin,
	type NotificationsApiRouter,
} from "./plugin";
export type {
	NotificationsBackendOptions,
	NotificationsPluginHooks,
	NotificationsHookContext,
	NotificationDelivery,
	NotificationSendResult,
} from "./operations";
export { notificationsSchema } from "../db";
export { notificationsPermissions } from "../permissions";
export {
	getNotification,
	listNotifications,
	getPreference,
	getPreferences,
} from "./getters";
export {
	createNotification,
	markAsRead,
	markAllAsRead,
	archiveNotification,
	updatePreference,
} from "./mutations";
export type * from "../types";
