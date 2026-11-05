"use client";

import { useEffect, useState } from "react";
import {
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import {
	useInfiniteQuery,
	useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import {
	createApiClient,
	SHARED_QUERY_CONFIG,
} from "@btst/stack/plugins/client";
import {
	createResource,
	type ResourceOverrides,
} from "@btst/stack/plugins/client/hooks";
import { createJobBoardQueryKeys, jobBoardResources } from "../../query-keys";
import type { JobsFilters } from "../../types";
import { JOB_BOARD_PLUGIN_ID } from "../constants";
import {
	jobBoardLocalization,
	type JobBoardLocalization,
} from "../localization";
import type { JobBoardPluginOverrides } from "../overrides";

const jobBoard = createResource({
	plugin: JOB_BOARD_PLUGIN_ID,
	resources: jobBoardResources,
});

function useJobListQuery(filters: JobsFilters) {
	const { api, plugins, queryClient } = useStack();
	const pluginApi = plugins?.[JOB_BOARD_PLUGIN_ID]?.api;
	const { headers: overrideHeaders } =
		usePluginOverrides<ResourceOverrides>(JOB_BOARD_PLUGIN_ID);
	const mergedHeaders = new Headers(pluginApi?.browserHeaders);
	if (overrideHeaders !== undefined) {
		for (const [name, value] of new Headers(overrideHeaders)) {
			mergedHeaders.set(name, value);
		}
	}
	const headers = mergedHeaders.keys().next().done ? undefined : mergedHeaders;
	const queries = createJobBoardQueryKeys(
		createApiClient({
			baseURL: pluginApi?.baseURL ?? api?.baseURL,
			basePath: pluginApi?.basePath ?? api?.basePath,
			headers,
			credentials: pluginApi?.credentials,
		}),
	);
	return {
		options: { ...queries.jobBoardJobs.list(filters), ...SHARED_QUERY_CONFIG },
		queryClient,
	};
}

/** Paginated public jobs; filters and the cache keys match the server SSG helpers. */
export function useJobs(filters: JobsFilters = {}) {
	const { options, queryClient } = useJobListQuery(filters);
	return useInfiniteQuery(options, queryClient);
}

/** Suspense variant used by the public listing and department pages. */
export function useSuspenseJobs(filters: JobsFilters = {}) {
	const { options, queryClient } = useJobListQuery(filters);
	const result = useSuspenseInfiniteQuery(options, queryClient);
	if (result.error && !result.isFetching) throw result.error;
	return result;
}

/** Fetch one open job by its public slug. */
export function useJob(slug: string) {
	return jobBoard.jobBoardJobs.detail.use([slug]);
}

/** Suspense variant used by the public job detail page. */
export function useSuspenseJob(slug: string) {
	return jobBoard.jobBoardJobs.detail.useSuspense([slug]);
}

/** Department, location and employment-type terms from current public roles. */
export function useJobTaxonomies() {
	return jobBoard.jobBoardJobs.taxonomies.use([]);
}

/** Resolve public page copy from the shared translator and plugin overrides. */
export function useJobBoardLocalization(): JobBoardLocalization {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<JobBoardPluginOverrides>(JOB_BOARD_PLUGIN_ID);
	return {
		...Object.fromEntries(
			Object.entries(jobBoardLocalization).map(([key, text]) => [
				key,
				t(`jobBoard.${key}`, text),
			]),
		),
		...localization,
	} as JobBoardLocalization;
}

/** Recheck time-sensitive visibility after hydration of a statically generated page. */
export function useJobBoardHydrated() {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	return hydrated;
}
