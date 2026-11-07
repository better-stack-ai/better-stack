export { analyticsClientPlugin, type AnalyticsClientConfig } from "./plugin";
export {
	createAnalyticsTracker,
	track,
	expose,
	type AnalyticsTracker,
	type AnalyticsTrackerOptions,
} from "./tracker";

export { createAnalyticsClientHooks } from "./bridges";
export type {
	AnalyticsBridgeContext,
	AnalyticsBridgeEvent,
	AnalyticsBridgeProperties,
} from "../bridges";

export type {
	AnalyticsPluginOverrides,
	AnalyticsTrafficChartProps,
} from "./overrides";
