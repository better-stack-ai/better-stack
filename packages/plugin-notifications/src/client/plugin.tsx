import { lazy, type ComponentType } from "react";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	defineRoute,
	defineRoutes,
	isConnectionError,
} from "@btst/stack/plugins/client";
import {
	createNotificationsQueryKeys,
	type NotificationsIdentityPartition,
} from "../query-keys";
import { NOTIFICATIONS_PLUGIN_ID } from "./constants";
import type { NotificationsPluginOverrides } from "./overrides";

const Inbox = lazy(() =>
	import("./components/pages").then((module) => ({
		default: module.NotificationsPageComponent,
	})),
);
const Preferences = lazy(() =>
	import("./components/pages").then((module) => ({
		default: module.NotificationPreferencesPageComponent,
	})),
);

export interface NotificationsLoaderContext {
	path: string;
	isSSR: boolean;
}

export interface NotificationsClientConfig {
	/** Pass the current identity so server-prefetched data matches browser keys. */
	identityPartition?: NotificationsIdentityPartition;
	hooks?: {
		beforeLoad?: (context: NotificationsLoaderContext) => void | Promise<void>;
		afterLoad?: (context: NotificationsLoaderContext) => void | Promise<void>;
		onErrorLoad?: (
			error: Error,
			context: NotificationsLoaderContext,
		) => void | Promise<void>;
	};
	pageComponents?: {
		inbox?: ComponentType;
		preferences?: ComponentType;
	};
}

export const notificationsClientPlugin = (
	config: NotificationsClientConfig = {},
) =>
	defineClientPlugin<NotificationsPluginOverrides>()({
		id: NOTIFICATIONS_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createNotificationsQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const preload =
				(
					path: string,
					entry: {
						queryKey: readonly unknown[];
						queryFn: () => Promise<unknown>;
					},
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const context = { path, isSSR: true };
					let error: unknown;
					try {
						await config.hooks?.beforeLoad?.(context);
						await runtime.queryClient.prefetchQuery({ ...entry, retry: false });
						error = runtime.queryClient.getQueryState(entry.queryKey)?.error;
						if (!error) await config.hooks?.afterLoad?.(context);
					} catch (caught) {
						error = caught;
						await runtime.queryClient.prefetchQuery({
							queryKey: entry.queryKey,
							queryFn: () => {
								throw createSanitizedSSRLoaderError();
							},
							retry: false,
							staleTime: 0,
						});
					}
					if (!error) return;
					if (isConnectionError(error))
						console.warn(
							"[btst/notifications] API unavailable during SSR prefetch.",
						);
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						// Reporting cannot reject a route loader.
					}
				};
			return {
				routes: () =>
					defineRoutes(
						{
							inbox: defineRoute("/notifications", {
								page: Inbox,
								loader: preload(
									"/notifications",
									queries.notifications.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								),
								meta: () => meta("Notifications"),
							}),
							preferences: defineRoute("/notifications/preferences", {
								page: Preferences,
								loader: preload(
									"/notifications/preferences",
									queries.notificationPreferences.list(
										config.identityPartition,
									),
								),
								meta: () => meta("Notification preferences"),
							}),
						},
						{ pages: config.pageComponents },
					),
				sitemap: async () => [],
			};
		},
	});

function meta(title: string) {
	return [{ title }, { name: "robots", content: "noindex, nofollow" }];
}
