import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type {
	AnalyticsCustomEvent,
	AnalyticsExperimentExposure,
	AnalyticsExperimentActivation,
	AnalyticsExperimentReport,
	AnalyticsExperimentVariantReport,
	AnalyticsDashboardStats,
	AnalyticsPageView,
	AnalyticsRangeParams,
	AnalyticsFunnelParams,
	AnalyticsFunnelResult,
	AnalyticsFunnelStep,
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

/** Bounded funnel aggregation. Callers own validation and authorization. */
export async function getFunnel(
	adapter: Adapter,
	params: AnalyticsFunnelParams,
	now = new Date(),
	retentionDays = 90,
): Promise<AnalyticsFunnelResult> {
	const { start, end } = analyticsDateRange(params, now, retentionDays);
	const rows: ((AnalyticsPageView | AnalyticsCustomEvent) & {
		kind: "pageview" | "event";
	})[] = [];
	for (const [kind, model] of [
		["pageview", "pageView"],
		["event", "customEvent"],
	] as const) {
		if (!params.steps.some((step) => step.type === kind)) continue;
		const batch = await adapter.findMany<
			AnalyticsPageView | AnalyticsCustomEvent
		>({
			model,
			where: [
				{ field: "timestamp", operator: "gte", value: start },
				{ field: "timestamp", operator: "lt", value: end },
			],
			limit: 20001 - rows.length,
		});
		if (rows.length + batch.length > 20000)
			throw new OperationHttpError(
				422,
				"Funnel exceeds 20,000 records; choose a shorter date range",
				"ANALYTICS_FUNNEL_LIMIT",
			);
		rows.push(...batch.map((row) => ({ ...row, kind })));
	}
	const sessions = new Map<string, typeof rows>();
	for (const row of rows) {
		const date = new Date(row.timestamp).toISOString().slice(0, 10);
		const key = JSON.stringify([row.sessionId, date]);
		const items = sessions.get(key) ?? [];
		items.push(row);
		sessions.set(key, items);
	}
	const counts = params.steps.map(() => 0);
	function matches(row: (typeof rows)[number], step: AnalyticsFunnelStep) {
		if (step.type !== row.kind) return false;
		return step.type === "pageview"
			? step.match === "prefix"
				? row.path.startsWith(step.path)
				: row.path === step.path
			: "name" in row && row.name === step.name;
	}
	for (const items of sessions.values()) {
		items.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
		const starts: (number | undefined)[] = params.steps.map(() => undefined);
		let reached = 0;
		for (let index = 0; index < items.length; ) {
			const time = new Date(items[index]!.timestamp).getTime();
			let next = index + 1;
			while (
				next < items.length &&
				new Date(items[next]!.timestamp).getTime() === time
			)
				next++;
			// Descending updates prevent equal timestamps from advancing consecutive steps.
			for (
				let stepIndex = params.steps.length - 1;
				stepIndex >= 0;
				stepIndex--
			) {
				const startTime = stepIndex === 0 ? time : starts[stepIndex - 1];
				if (
					startTime === undefined ||
					time - startTime > params.windowMinutes * 60000
				)
					continue;
				let matched = false;
				for (let rowIndex = index; rowIndex < next && !matched; rowIndex++)
					matched = matches(items[rowIndex]!, params.steps[stepIndex]!);
				if (matched) {
					// The latest viable start dominates earlier starts for future window checks.
					starts[stepIndex] = startTime;
					reached = Math.max(reached, stepIndex + 1);
				}
			}
			index = next;
		}
		for (let index = 0; index < reached; index++) counts[index]!++;
	}
	const percentage = (count: number, total: number) =>
		total ? Math.round((count / total) * 1000) / 10 : 0;
	const totalSessions = counts[0]!;
	const convertedSessions = counts.at(-1)!;
	return {
		start: start.toISOString(),
		end: end.toISOString(),
		windowMinutes: params.windowMinutes,
		totalSessions,
		convertedSessions,
		conversionRate: percentage(convertedSessions, totalSessions),
		steps: params.steps.map((step, index) => {
			const sessions = counts[index]!;
			const previous = index ? counts[index - 1]! : sessions;
			return {
				step: { ...step },
				sessions,
				conversionRate: percentage(sessions, totalSessions),
				dropOff: previous - sessions,
				dropOffRate: percentage(previous - sessions, previous),
			};
		}),
	};
}

/** Export the same bounded funnel report; formula-like matcher cells are escaped. */
export async function exportFunnel(
	adapter: Adapter,
	params: AnalyticsFunnelParams,
	now = new Date(),
	retentionDays = 90,
) {
	const report = await getFunnel(adapter, params, now, retentionDays);
	return [
		"step,type,matcher,match,sessions,conversionRate,dropOff,dropOffRate,start,end,windowMinutes",
		...report.steps.map((item, index) =>
			[
				index + 1,
				item.step.type,
				item.step.type === "event" ? item.step.name : item.step.path,
				item.step.type === "event" ? "exact" : item.step.match,
				item.sessions,
				item.conversionRate,
				item.dropOff,
				item.dropOffRate,
				report.start,
				report.end,
				report.windowMinutes,
			]
				.map(csvCell)
				.join(","),
		),
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
	let activationIndex = 0;
	const activeBySession = new Map<string, AnalyticsExperimentActivation>();
	for (const event of events) {
		const time = new Date(event.timestamp).getTime();
		// Reactivating an older configuration changes ownership without renewing its first-exposure window.
		while (
			activationIndex < activations.length &&
			new Date(activations[activationIndex]!.timestamp).getTime() < time
		) {
			const activation = activations[activationIndex++]!;
			activeBySession.set(activation.sessionId, activation);
		}
		const activation = activeBySession.get(event.sessionId);
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
