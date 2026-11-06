import type { ComponentType } from "react";
import type { AnalyticsSeriesPoint } from "../types";

/** Traffic series supplied by the built-in dashboard. */
export interface AnalyticsTrafficChartProps {
	/** Daily page view and visitor totals. */
	series: AnalyticsSeriesPoint[];
}

/** Presentation customization for built-in analytics pages. */
export interface AnalyticsPluginOverrides {
	/** Replace only the dashboard chart, retaining filters, metrics, and tables. */
	pageOverrides?: {
		analyticsDashboard?: {
			TrafficChart?: ComponentType<AnalyticsTrafficChartProps>;
		};
	};
}
