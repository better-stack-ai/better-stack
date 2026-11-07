import type { DBAdapter as Adapter } from "@btst/db";
import type {
	AnalyticsCustomEvent,
	AnalyticsExperimentExposure,
	AnalyticsExperimentActivation,
	AnalyticsExperimentReport,
	AnalyticsExperimentVariantReport,
	AnalyticsDashboardStats,
	AnalyticsPageView,
	AnalyticsRangeParams,
} from "../types";

const DAY = 86400000;

/** Resolve UTC boundaries; callers own input validation and authorization. */
export function analyticsDateRange(
	params: AnalyticsRangeParams,
	now = new Date(),
	retentionDays = 90,
) {
	const today = new Date(now);
	today.setUTCHours(0, 0, 0, 0);
	let start =
		params.range === "custom" && params.start
			? new Date(params.start)
			: new Date(
					today.getTime() -
						((params.range === "30d" ? 30 : params.range === "today" ? 1 : 7) -
							1) *
							DAY,
				);
	const end =
		params.range === "custom" && params.end
			? new Date(Date.parse(params.end) + (params.end.length === 10 ? DAY : 0))
			: now;
	start = new Date(
		Math.max(start.getTime(), now.getTime() - retentionDays * DAY),
	);
	return { start, end };
}

/** Read retained raw rows in batches. Callers own validation and access control. */
export async function getAnalyticsRows<
	T extends AnalyticsPageView | AnalyticsCustomEvent,
>(
	adapter: Adapter,
	model: "pageView" | "customEvent",
	params: AnalyticsRangeParams,
	now = new Date(),
	retentionDays = 90,
): Promise<T[]> {
	const { start, end } = analyticsDateRange(params, now, retentionDays);
	const where = [
		{ field: "timestamp", operator: "gte" as const, value: start },
		{ field: "timestamp", operator: "lt" as const, value: end },
		...(params.path
			? [{ field: "path", operator: "eq" as const, value: params.path }]
			: []),
	];
	const rows: T[] = [];
	for (let offset = 0; ; offset += 1000) {
		const batch = await adapter.findMany<T>({
			model,
			where,
			limit: 1000,
			offset,
			sortBy: { field: "timestamp", direction: "asc" },
		});
		rows.push(...batch);
		if (batch.length < 1000) return rows;
	}
}

/** Aggregate retained traffic. Pure DB read; callers own authorization. */
export async function getDashboardStats(
	adapter: Adapter,
	params: AnalyticsRangeParams = {},
	now = new Date(),
	retentionDays = 90,
): Promise<AnalyticsDashboardStats> {
	const [views, events] = await Promise.all([
		getAnalyticsRows<AnalyticsPageView>(
			adapter,
			"pageView",
			params,
			now,
			retentionDays,
		),
		getAnalyticsRows<AnalyticsCustomEvent>(
			adapter,
			"customEvent",
			params,
			now,
			retentionDays,
		),
	]);
	const { start, end } = analyticsDateRange(params, now, retentionDays);
	const days: string[] = [];
	const cursor = new Date(start);
	cursor.setUTCHours(0, 0, 0, 0);
	for (
		;
		cursor.getTime() < end.getTime();
		cursor.setUTCDate(cursor.getUTCDate() + 1)
	)
		days.push(cursor.toISOString().slice(0, 10));
	const sessions = new Map<string, number[]>();
	const pageGroups = new Map<string, AnalyticsPageView[]>();
	const referrerGroups = new Map<string, AnalyticsPageView[]>();
	for (const view of views) {
		const times = sessions.get(view.sessionId) ?? [];
		times.push(new Date(view.timestamp).getTime());
		sessions.set(view.sessionId, times);
		const pageItems = pageGroups.get(view.path) ?? [];
		pageItems.push(view);
		pageGroups.set(view.path, pageItems);
		const referrer = view.referrer || "Direct";
		const referrerItems = referrerGroups.get(referrer) ?? [];
		referrerItems.push(view);
		referrerGroups.set(referrer, referrerItems);
	}
	const visits: number[][] = [];
	for (const times of sessions.values()) {
		times.sort((a, b) => a - b);
		let visit: number[] = [];
		for (const time of times) {
			if (visit.length && time - visit[visit.length - 1]! > 30 * 60000) {
				visits.push(visit);
				visit = [];
			}
			visit.push(time);
		}
		if (visit.length) visits.push(visit);
	}
	const eventCounts = new Map<string, number>();
	for (const event of events)
		eventCounts.set(event.name, (eventCounts.get(event.name) ?? 0) + 1);
	const limit = params.limit ?? 10;
	return {
		uniqueVisitors: sessions.size,
		pageViews: views.length,
		bounceRate: visits.length
			? Math.round(
					(visits.filter((visit) => visit.length === 1).length /
						visits.length) *
						1000,
				) / 10
			: 0,
		sessionDuration: visits.length
			? Math.round(
					visits.reduce(
						(sum, visit) => sum + (visit[visit.length - 1]! - visit[0]!) / 1000,
						0,
					) / visits.length,
				)
			: 0,
		series: days.map((date) => {
			const daily = views.filter((view) =>
				new Date(view.timestamp).toISOString().startsWith(date),
			);
			return {
				date,
				pageViews: daily.length,
				visitors: new Set(daily.map((view) => view.sessionId)).size,
			};
		}),
		topPages: [...pageGroups]
			.map(([path, items]) => ({
				path,
				views: items.length,
				visitors: new Set(items.map((item) => item.sessionId)).size,
				trend: days.map(
					(date) =>
						items.filter((item) =>
							new Date(item.timestamp).toISOString().startsWith(date),
						).length,
				),
			}))
			.sort((a, b) => b.views - a.views || a.path.localeCompare(b.path))
			.slice(0, limit),
		topReferrers: [...referrerGroups]
			.map(([referrer, items]) => ({
				referrer,
				views: items.length,
				visitors: new Set(items.map((item) => item.sessionId)).size,
			}))
			.sort((a, b) => b.views - a.views || a.referrer.localeCompare(b.referrer))
			.slice(0, limit),
		topEvents: [...eventCounts]
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
			.slice(0, limit),
	};
}

/** Top pages for server-side embedding; callers own authorization. */
export async function getTopPages(
	adapter: Adapter,
	params: AnalyticsRangeParams = {},
	now = new Date(),
	retentionDays = 90,
) {
	return (await getDashboardStats(adapter, params, now, retentionDays))
		.topPages;
}

/** Top referrers for server-side embedding; callers own authorization. */
export async function getTopReferrers(
	adapter: Adapter,
	params: AnalyticsRangeParams = {},
	now = new Date(),
	retentionDays = 90,
) {
	return (await getDashboardStats(adapter, params, now, retentionDays))
		.topReferrers;
}

/** Top custom events for server-side embedding; callers own authorization. */
export async function getTopEvents(
	adapter: Adapter,
	params: AnalyticsRangeParams = {},
	now = new Date(),
	retentionDays = 90,
) {
	return (await getDashboardStats(adapter, params, now, retentionDays))
		.topEvents;
}

/** Unique visitors with a page view in the last five minutes. Callers own authorization. */
export async function getRealtimeVisitors(
	adapter: Adapter,
	now = new Date(),
	retentionDays = 90,
) {
	const views = await getAnalyticsRows<AnalyticsPageView>(
		adapter,
		"pageView",
		{
			range: "custom",
			start: new Date(now.getTime() - 5 * 60000).toISOString(),
			end: now.toISOString(),
		},
		now,
		retentionDays,
	);
	return { visitors: new Set(views.map((view) => view.sessionId)).size };
}

function csvCell(value: unknown): string {
	const raw = String(value ?? "");
	const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
	return `"${safe.replaceAll('"', '""')}"`;
}

/** Export retained raw events. Formula-like cells are escaped. Callers own authorization. */
export async function exportEvents(
	adapter: Adapter,
	params: AnalyticsRangeParams = {},
	now = new Date(),
	retentionDays = 90,
): Promise<string> {
	const [views, events] = await Promise.all([
		getAnalyticsRows<AnalyticsPageView>(
			adapter,
			"pageView",
			params,
			now,
			retentionDays,
		),
		getAnalyticsRows<AnalyticsCustomEvent>(
			adapter,
			"customEvent",
			params,
			now,
			retentionDays,
		),
	]);
	const rows = [
		...views.map((view) => [
			"pageview",
			view.path,
			"",
			view.referrer,
			"",
			view.sessionId,
			new Date(view.timestamp).toISOString(),
		]),
		...events.map((event) => [
			"event",
			event.path,
			event.name,
			"",
			event.properties,
			event.sessionId,
			new Date(event.timestamp).toISOString(),
		]),
	];
	return [
		"type,path,name,referrer,properties,sessionId,timestamp",
		...rows.map((row) => row.map(csvCell).join(",")),
	].join("\r\n");
}

async function getExperimentHistory<T>(
	adapter: Adapter,
	model: "experimentExposure" | "experimentActivation",
	experimentKey: string,
	end: Date,
	now: Date,
	retentionDays: number,
): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += 1000) {
		const batch = await adapter.findMany<T>({
			model,
			where: [
				{ field: "experimentKey", value: experimentKey, operator: "eq" },
				{
					field: "timestamp",
					value: new Date(now.getTime() - retentionDays * DAY),
					operator: "gte",
				},
				{ field: "timestamp", value: end, operator: "lt" },
			],
			limit: 1000,
			offset,
			sortBy: { field: "timestamp", direction: "asc" },
		});
		rows.push(...batch);
		if (batch.length < 1000) return rows;
	}
}

/** Read-only exposure cohort report. Callers own validation and authorization. */
export async function getExperimentReport(
	adapter: Adapter,
	params: AnalyticsRangeParams & { experimentKey: string },
	now = new Date(),
	retentionDays = 90,
): Promise<AnalyticsExperimentReport> {
	const { start, end } = analyticsDateRange(params, now, retentionDays);
	const [exposures, activations] = await Promise.all([
		getExperimentHistory<AnalyticsExperimentExposure>(
			adapter,
			"experimentExposure",
			params.experimentKey,
			end,
			now,
			retentionDays,
		),
		getExperimentHistory<AnalyticsExperimentActivation>(
			adapter,
			"experimentActivation",
			params.experimentKey,
			end,
			now,
			retentionDays,
		),
	]);
	// Defend reports against duplicate rows from adapters without unique constraints.
	const firstExposures = [
		...new Map(
			exposures.toReversed().map((row) => [row.dedupKey, row]),
		).values(),
	].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
	const exposureByKey = new Map(
		firstExposures.map((row) => [row.dedupKey, row]),
	);
	const groups = new Map<
		string,
		{
			row: AnalyticsExperimentVariantReport;
			subjects: Set<string>;
			converted: Set<string>;
		}
	>();
	for (const exposure of firstExposures) {
		if (new Date(exposure.timestamp) < start) continue;
		const key = JSON.stringify([
			exposure.configurationVersion,
			exposure.variant,
		]);
		let group = groups.get(key);
		if (!group) {
			group = {
				row: {
					flagKey: exposure.flagKey,
					configurationVersion: exposure.configurationVersion,
					variant: exposure.variant,
					conversionEvent: exposure.conversionEvent,
					attributionWindowMs: exposure.attributionWindowMs,
					subjects: 0,
					exposures: 0,
					conversions: 0,
					conversionRate: 0,
				},
				subjects: new Set(),
				converted: new Set(),
			};
			groups.set(key, group);
		}
		group.subjects.add(exposure.sessionId);
		group.row.exposures++;
	}
	const events = await getAnalyticsRows<AnalyticsCustomEvent>(
		adapter,
		"customEvent",
		params,
		now,
		retentionDays,
	);
	for (const event of events) {
		const time = new Date(event.timestamp).getTime();
		// Reactivating an older configuration changes ownership without renewing its first-exposure window.
		const activation = activations.findLast(
			(row) =>
				row.sessionId === event.sessionId &&
				new Date(row.timestamp).getTime() < time,
		);
		const exposure = activation
			? exposureByKey.get(activation.exposureKey)
			: undefined;
		if (
			!exposure ||
			new Date(exposure.timestamp) < start ||
			exposure.conversionEvent !== event.name
		)
			continue;
		if (
			new Date(exposure.timestamp).toISOString().slice(0, 10) !==
				new Date(event.timestamp).toISOString().slice(0, 10) ||
			time - new Date(exposure.timestamp).getTime() >
				exposure.attributionWindowMs
		)
			continue;
		groups
			.get(JSON.stringify([exposure.configurationVersion, exposure.variant]))
			?.converted.add(event.sessionId);
	}
	return {
		experimentKey: params.experimentKey,
		flagKey: firstExposures[0]?.flagKey ?? "",
		attribution: "same-session-utc-day",
		rows: [...groups.values()]
			.map(({ row, subjects, converted }) => ({
				...row,
				subjects: subjects.size,
				conversions: converted.size,
				conversionRate: subjects.size
					? Math.round((converted.size / subjects.size) * 10000) / 100
					: 0,
			}))
			.sort(
				(a, b) =>
					a.configurationVersion.localeCompare(b.configurationVersion) ||
					a.variant.localeCompare(b.variant),
			),
	};
}
