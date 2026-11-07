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

/** Literal matchers for ordered anonymous-session funnels. Prefixes use startsWith. */
export type AnalyticsFunnelStep =
	| { type: "pageview"; path: string; match: "exact" | "prefix" }
	| { type: "event"; name: string };

/** Funnels accept 2–8 steps, at most 31 days, and a 1–1440 minute window. */
export type AnalyticsFunnelParams = Pick<
	AnalyticsRangeParams,
	"range" | "start" | "end"
> & {
	windowMinutes: number;
	steps: readonly AnalyticsFunnelStep[];
};

/** Sessions are daily anonymous identifiers; totalSessions counts first-step entrants. */
export type AnalyticsFunnelResult = {
	start: string;
	end: string;
	windowMinutes: number;
	totalSessions: number;
	convertedSessions: number;
	conversionRate: number;
	steps: {
		step: AnalyticsFunnelStep;
		sessions: number;
		/** Percentage of first-step entrants. */
		conversionRate: number;
		/** Loss from the preceding step; zero for the first step. */
		dropOff: number;
		dropOffRate: number;
	}[];
};
