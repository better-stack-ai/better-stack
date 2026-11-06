"use client";

import type { ReactNode } from "react";
import type { FallbackProps } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import { NOTIFICATIONS_PLUGIN_ID } from "../constants";
import type { NotificationsPluginOverrides } from "../overrides";

export function useNotificationsLabels() {
	const { localization } = usePluginOverrides<NotificationsPluginOverrides>(
		NOTIFICATIONS_PLUGIN_ID,
	);
	return {
		title: "Notifications",
		preferences: "Preferences",
		empty: "You're all caught up.",
		markAllAsRead: "Mark all as read",
		...localization,
	};
}

export function NotificationsPage({
	title,
	children,
	action,
}: {
	title: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<section className="notifications-page">
			<header className="nt-header">
				<h1>{title}</h1>
				{action}
			</header>
			{children}
		</section>
	);
}

export function NotificationsLoading() {
	return (
		<section className="notifications-page" role="status">
			Loading notifications…
		</section>
	);
}

export function NotificationsError({ resetErrorBoundary }: FallbackProps) {
	return (
		<section className="notifications-page" role="alert">
			<h1>Notifications unavailable</h1>
			<p>Check your access and try again.</p>
			<button type="button" onClick={resetErrorBoundary}>
				Try again
			</button>
		</section>
	);
}

export function NotificationsNotFound({ message }: { message: string }) {
	return (
		<section className="notifications-page">
			<h1>Not found</h1>
			<p>{message}</p>
		</section>
	);
}
