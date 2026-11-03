import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import { jobsListDiscriminator } from "./api/query-key-defs";
import type { Job, JobsFilters, JobsPage, JobTaxonomies } from "./types";

/** Public job resources. All publication and closing-date filtering happens on the server. */
export const jobBoardResources = {
	jobBoardJobs: {
		queries: {
			list: {
				path: "/jobs",
				query: (filters: JobsFilters = {}) => jobsListDiscriminator(filters),
				key: (filters: JobsFilters = {}) => [jobsListDiscriminator(filters)],
				select: (data: unknown): JobsPage => data as JobsPage,
				infinite: true,
				pageSize: (filters: JobsFilters = {}) => filters.limit ?? 12,
				nextPageParam: (lastPage: JobsPage) => {
					const next = lastPage.offset + lastPage.items.length;
					return lastPage.items.length > 0 && next < lastPage.total
						? next
						: undefined;
				},
			},
			detail: {
				path: "/jobs/:slug",
				params: (slug: string) => ({ slug }),
				key: (slug: string) => [slug],
				select: (data: unknown): Job => data as Job,
			},
			taxonomies: {
				path: "/jobs/taxonomies",
				key: () => ["all"],
				select: (data: unknown): JobTaxonomies => data as JobTaxonomies,
			},
		},
	},
} satisfies ResourcesDeclaration;

/** Server-safe query factory used by SSR loaders and public resource hooks. */
export function createJobBoardQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	const queries = createResourceQueryKeys(client, jobBoardResources, headers);
	const list = Object.assign(
		(filters: JobsFilters = {}) => {
			const query = queries.jobBoardJobs.list(filters);
			return {
				...query,
				queryFn: (context?: { pageParam?: unknown }) =>
					query.queryFn({
						pageParam: context?.pageParam ?? filters.offset ?? 0,
					}),
				initialPageParam: filters.offset ?? 0,
				getNextPageParam:
					jobBoardResources.jobBoardJobs.queries.list.nextPageParam,
			};
		},
		{ _def: queries.jobBoardJobs.list._def },
	);
	return { ...queries, jobBoardJobs: { ...queries.jobBoardJobs, list } };
}

export { JOB_BOARD_QUERY_KEYS } from "./api/query-key-defs";
