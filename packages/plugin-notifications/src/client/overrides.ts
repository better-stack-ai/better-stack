import type { ComponentType } from "react";
import type { Notification } from "../types";

/** Notification presentation overrides supplied through StackProvider. */
export interface NotificationsPluginOverrides {
	/** Replace inbox rows while preserving the bell and inbox controls. */
	pageOverrides?: {
		inbox?: { NotificationRow?: ComponentType<{ item: Notification }> };
	};
	localization?: Partial<{
		title: string;
		preferences: string;
		empty: string;
		markAllAsRead: string;
	}>;
}
