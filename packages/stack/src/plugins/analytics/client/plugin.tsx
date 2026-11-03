import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	defineRoute,
	defineRoutes,
} from "@btst/stack/plugins/client";
import { ANALYTICS_PLUGIN_ID } from "./constants";
import { createAnalyticsTracker, setDefaultAnalyticsTracker } from "./tracker";

const DashboardPage = lazy(() =>
	import("./components/pages/dashboard-page").then((module) => ({
		default: module.AnalyticsDashboardPageComponent,
	})),
);

/** Options specific to the analytics client plugin. API/site settings belong on createClientStack(). */
export interface AnalyticsClientConfig {
	/** Automatically track rendered BTST routes. Defaults to true. */
	tracking?: boolean;
	/** Replace the dashboard while retaining the analytics route. */
	pageComponents?: { dashboard?: ComponentType };
}

/** First-party page tracking and a protected, dynamic analytics dashboard. */
export const analyticsClientPlugin = (config: AnalyticsClientConfig = {}) =>
	defineClientPlugin({
		id: ANALYTICS_PLUGIN_ID,
		resolve: (runtime) => {
			const tracker = createAnalyticsTracker({
				apiBaseURL: runtime.api.baseURL,
				apiBasePath: runtime.api.basePath,
				credentials: runtime.api.credentials,
			});
			setDefaultAnalyticsTracker(tracker);
			return {
				hooks: {
					onRouteRender: ({ path }: { path: string }) =>
						config.tracking === false
							? undefined
							: tracker
									.pageView(
										typeof window === "undefined"
											? path
											: window.location.pathname,
									)
									.then(() => {}),
				},
				routes: () =>
					defineRoutes(
						{
							dashboard: defineRoute("/analytics", {
								page: DashboardPage,
								meta: () => [
									{ title: "Analytics" },
									{ name: "robots", content: "noindex, nofollow" },
								],
							}),
						},
						{ pages: config.pageComponents },
					),
			};
		},
	});
