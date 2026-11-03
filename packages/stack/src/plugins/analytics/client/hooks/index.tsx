"use client";

import { useEffect } from "react";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { analyticsResources } from "../../query-keys";
import type { AnalyticsRangeParams } from "../../types";
import { ANALYTICS_PLUGIN_ID } from "../constants";

const analytics = createResource({
	plugin: ANALYTICS_PLUGIN_ID,
	resources: analyticsResources,
});

function useAnalyticsPartition() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const { plugins } = useStack();
	const api = plugins?.[ANALYTICS_PLUGIN_ID]?.api;
	return {
		identity,
		generation,
		isPending,
		error: !!error,
		endpoint: [api?.baseURL, api?.basePath],
	};
}

/** Dashboard metrics and ranked traffic for the selected UTC range. */
export function useDashboardStats(params: AnalyticsRangeParams = {}) {
	const partition = useAnalyticsPartition();
	return analytics.analyticsDashboard.stats.use([params, partition], {
		enabled: !partition.isPending && !partition.error,
	});
}

/** Suspense dashboard query; refetch errors reach the route's error boundary. */
export function useSuspenseDashboardStats(params: AnalyticsRangeParams = {}) {
	return analytics.analyticsDashboard.stats.useSuspense([
		params,
		useAnalyticsPartition(),
	]);
}

/** Top pages, suitable for embedding page traffic in another plugin. */
export function useTopPages(params: AnalyticsRangeParams = {}) {
	const partition = useAnalyticsPartition();
	return analytics.analyticsDashboard.pages.use([params, partition], {
		enabled: !partition.isPending && !partition.error,
	});
}

/** External referrers for the selected range. */
export function useTopReferrers(params: AnalyticsRangeParams = {}) {
	const partition = useAnalyticsPartition();
	return analytics.analyticsDashboard.referrers.use([params, partition], {
		enabled: !partition.isPending && !partition.error,
	});
}

/** Custom event counts for the selected range. */
export function useTopEvents(params: AnalyticsRangeParams = {}) {
	const partition = useAnalyticsPartition();
	return analytics.analyticsDashboard.events.use([params, partition], {
		enabled: !partition.isPending && !partition.error,
	});
}

/** Visitors active in the last five minutes, refreshed every fifteen seconds. */
export function useRealtimeVisitors() {
	const partition = useAnalyticsPartition();
	const result = analytics.analyticsDashboard.realtime.use([partition], {
		enabled: !partition.isPending && !partition.error,
	});
	const { refetch } = result;
	useEffect(() => {
		if (partition.isPending || partition.error) return;
		const interval = setInterval(() => {
			if (document.visibilityState === "visible") void refetch();
		}, 15000);
		return () => clearInterval(interval);
	}, [refetch, partition.isPending, partition.error]);
	return result;
}
