"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { useIdentity } from "@btst/stack/context";
import { notificationsPermissions } from "../../permissions";
import {
	NotificationsError,
	NotificationsLoading,
	NotificationsNotFound,
} from "./shared";

const Inbox = lazy(() =>
	import("./pages/inbox-page.internal").then((module) => ({
		default: module.InboxPage,
	})),
);
const Preferences = lazy(() =>
	import("./pages/preferences-page.internal").then((module) => ({
		default: module.PreferencesPage,
	})),
);
const boundary = {
	ErrorComponent: NotificationsError,
	LoadingComponent: NotificationsLoading,
	NotFoundComponent: NotificationsNotFound,
	onError: (error: Error) => console.error("[btst/notifications]", error),
};

export function NotificationsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/notifications"
			permission={notificationsPermissions.inbox.read()}
			PageComponent={Inbox}
		/>
	);
}

export function NotificationPreferencesPageComponent() {
	const { identity } = useIdentity();
	return (
		<ComposedRoute
			key={identity?.id}
			{...boundary}
			path="/notifications/preferences"
			permission={notificationsPermissions.preferences.read()}
			PageComponent={Preferences}
		/>
	);
}
