export { analyticsBackendPlugin, type AnalyticsApiRouter } from "./plugin";
export type {
	AnalyticsBackendOptions,
	AnalyticsBackendHooks,
	AnalyticsIngestEvent,
	AnalyticsIngestContext,
} from "./operations";
export {
	getDashboardStats,
	getTopPages,
	getTopReferrers,
	getTopEvents,
	getRealtimeVisitors,
	exportEvents,
} from "./getters";
export { recordPageView, recordEvent, cleanupExpiredEvents } from "./mutations";
export { analyticsSchema } from "../db";
export { analyticsPermissions } from "../permissions";
export type * from "../types";

export {
	createAnalyticsServerHooks,
	type AnalyticsServerBridgeOptions,
} from "./bridges";
export type {
	AnalyticsBridgeContext,
	AnalyticsBridgeEvent,
	AnalyticsBridgeProperties,
} from "../bridges";
