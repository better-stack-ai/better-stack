/** Date filters shared by the dashboard and embeddable aggregation API. Dates use UTC. */
export type AnalyticsRangeParams = {
	range?: "today" | "7d" | "30d" | "custom";
	start?: string;
	end?: string;
	path?: string;
	limit?: number;
};

/** One UTC day of traffic. */
export type AnalyticsSeriesPoint = {
	date: string;
	pageViews: number;
	visitors: number;
};

/** Page traffic and daily page-view counts for a sparkline. */
export type AnalyticsTopPage = {
	path: string;
	views: number;
	visitors: number;
	trend: number[];
};

/** External referrer host and its traffic. */
export type AnalyticsTopReferrer = {
	referrer: string;
	views: number;
	visitors: number;
};

/** Custom event name and number of occurrences. */
export type AnalyticsTopEvent = {
	name: string;
	count: number;
};

/** Aggregated traffic. Duration is in seconds and bounce rate is a percentage. */
export type AnalyticsDashboardStats = {
	uniqueVisitors: number;
	pageViews: number;
	bounceRate: number;
	sessionDuration: number;
	series: AnalyticsSeriesPoint[];
	topPages: AnalyticsTopPage[];
	topReferrers: AnalyticsTopReferrer[];
	topEvents: AnalyticsTopEvent[];
};

/** Raw page-view record. Session IDs are irreversibly hashed before insertion. */
export type AnalyticsPageView = {
	id: string;
	path: string;
	referrer?: string | null;
	country?: string | null;
	device?: string | null;
	browser?: string | null;
	sessionId: string;
	timestamp: Date;
};

/** Raw custom-event record. Properties contain serialized JSON. */
export type AnalyticsCustomEvent = {
	id: string;
	name: string;
	path: string;
	properties?: string | null;
	sessionId: string;
	timestamp: Date;
};
