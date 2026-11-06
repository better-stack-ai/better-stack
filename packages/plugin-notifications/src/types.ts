export type Notification = {
	id: string;
	recipientId: string;
	category: string;
	title: string;
	body: string;
	href: string | null;
	readAt: string | null;
	archivedAt: string | null;
	createdAt: string;
};

export type NotificationPreference = {
	id: string;
	recipientId: string;
	category: string;
	inApp: boolean;
	email: boolean;
	updatedAt: string;
};

export type NotificationCategory = {
	id: string;
	label?: string;
	inApp?: boolean;
	email?: boolean;
};

export type NotificationRecord = Omit<
	Notification,
	"readAt" | "archivedAt" | "createdAt"
> & {
	readAt: Date | null;
	archivedAt: Date | null;
	createdAt: Date;
};
export type NotificationPreferenceRecord = Omit<
	NotificationPreference,
	"updatedAt"
> & { key: string; updatedAt: Date };
export type NotificationList = {
	items: Notification[];
	total: number;
	unreadCount: number;
};
export type {
	SendNotificationInput,
	UpdatePreferencesInput,
	ListNotificationsInput,
} from "./schemas";
