import {
	analyticsBackendPlugin,
	type AnalyticsBackendOptions,
	type AnalyticsDashboardStats,
} from "@btst/plugin-analytics/api";
import {
	analyticsClientPlugin,
	createAnalyticsTracker,
	track,
} from "@btst/plugin-analytics/client";
import {
	useDashboardStats,
	useSuspenseDashboardStats,
	useTopPages,
	useTopReferrers,
	useTopEvents,
	useRealtimeVisitors,
} from "@btst/plugin-analytics/client/hooks";
import { AnalyticsDashboardPageComponent } from "@btst/plugin-analytics/client/components";
import { createAnalyticsQueryKeys } from "@btst/plugin-analytics/query-keys";
import { analyticsPermissions } from "@btst/plugin-analytics/permissions";
import type { AnalyticsRangeParams } from "@btst/plugin-analytics/types";
const config: AnalyticsBackendOptions = {
	retentionDays: 30,
	sessionSecret: "public-types-secret",
};
const backend = analyticsBackendPlugin(config);
const client = analyticsClientPlugin({ tracking: false });
const id: "analytics" = client.id;
// @ts-expect-error Framework API configuration belongs on createClientStack.
analyticsClientPlugin({ apiBaseURL: "https://example.test" });
const range: AnalyticsRangeParams = {
	range: "custom",
	start: "2026-01-01",
	end: "2026-01-07",
};
export {
	backend,
	client,
	id,
	range,
	createAnalyticsTracker,
	track,
	useDashboardStats,
	useSuspenseDashboardStats,
	useTopPages,
	useTopReferrers,
	useTopEvents,
	useRealtimeVisitors,
	AnalyticsDashboardPageComponent,
	createAnalyticsQueryKeys,
	analyticsPermissions,
};
export type { AnalyticsDashboardStats };
