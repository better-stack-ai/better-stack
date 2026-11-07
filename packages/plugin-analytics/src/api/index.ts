export { analyticsBackendPlugin, type AnalyticsApiRouter } from "./plugin";
export type {
	AnalyticsBackendOptions,
	AnalyticsBackendHooks,
	AnalyticsExperimentsOptions,
	AnalyticsIngestEvent,
	AnalyticsIngestContext,
} from "./operations";
export {
	getDashboardStats,
	getExperimentReport,
	getTopPages,
	getTopReferrers,
	getTopEvents,
	getRealtimeVisitors,
	exportEvents,
	getFunnel,
	exportFunnel,
} from "./getters";
export {
	recordPageView,
	recordEvent,
	recordExperimentExposure,
	cleanupExpiredEvents,
} from "./mutations";
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
