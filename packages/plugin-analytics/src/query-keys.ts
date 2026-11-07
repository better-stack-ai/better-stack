import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	AnalyticsDashboardStats,
	AnalyticsRangeParams,
	AnalyticsTopPage,
	AnalyticsTopReferrer,
	AnalyticsTopEvent,
	AnalyticsExperimentReport,
} from "./types";

const rangeQuery = (
	params: AnalyticsRangeParams = {},
	_partition?: unknown,
) => ({ ...params, range: params.range ?? "7d" });
const rangeKey = (params: AnalyticsRangeParams = {}, partition?: unknown) => [
	params,
	partition,
];

/** Shared declarations for dynamic dashboard hooks and server query consumers. */
export const analyticsResources = {
	analyticsDashboard: {
		queries: {
			experiment: {
				path: "/analytics/experiments",
				query: (
					params: AnalyticsRangeParams & { experimentKey: string },
					_partition?: unknown,
				) => ({ ...params, range: params.range ?? "7d" }),
				key: (
					params: AnalyticsRangeParams & { experimentKey: string },
					partition?: unknown,
				) => [params, partition],
				select: (data: unknown): AnalyticsExperimentReport =>
					data as AnalyticsExperimentReport,
			},
			stats: {
				path: "/analytics/dashboard",
				query: rangeQuery,
				key: rangeKey,
				select: (data: unknown): AnalyticsDashboardStats =>
					data as AnalyticsDashboardStats,
			},
			realtime: {
				path: "/analytics/realtime",
				key: (partition?: unknown) => [partition],
				select: (data: unknown): { visitors: number } =>
					data as { visitors: number },
			},
			pages: {
				path: "/analytics/pages",
				query: rangeQuery,
				key: rangeKey,
				select: (data: unknown): AnalyticsTopPage[] =>
					data as AnalyticsTopPage[],
			},
			referrers: {
				path: "/analytics/referrers",
				query: rangeQuery,
				key: rangeKey,
				select: (data: unknown): AnalyticsTopReferrer[] =>
					data as AnalyticsTopReferrer[],
			},
			events: {
				path: "/analytics/events",
				query: rangeQuery,
				key: rangeKey,
				select: (data: unknown): AnalyticsTopEvent[] =>
					data as AnalyticsTopEvent[],
			},
		},
	},
} satisfies ResourcesDeclaration;

/** Construct analytics query options using the same keys as the browser hooks. */
export function createAnalyticsQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, analyticsResources, headers);
}
