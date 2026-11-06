export interface NotificationsPluginOverrides {
	localization?: Partial<{
		title: string;
		preferences: string;
		empty: string;
		markAllAsRead: string;
	}>;
}
