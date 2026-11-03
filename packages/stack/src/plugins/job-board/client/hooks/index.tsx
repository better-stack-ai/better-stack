"use client";

import { useEffect, useState } from "react";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { jobBoardResources } from "@btst/stack/plugins/job-board/query-keys";
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

/** Paginated public jobs; filters and the cache keys match the server SSG helpers. */
export function useJobs(filters: JobsFilters = {}) {
	return jobBoard.jobBoardJobs.list.useInfinite([filters]);
}

/** Suspense variant used by the public listing and department pages. */
export function useSuspenseJobs(filters: JobsFilters = {}) {
	return jobBoard.jobBoardJobs.list.useSuspenseInfinite([filters]);
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
