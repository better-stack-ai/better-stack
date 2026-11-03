import type { JobsFilters } from "../types";

/** Normalize equivalent public filters to one HTTP/SSG cache discriminator. */
export function jobsListDiscriminator(filters: JobsFilters = {}) {
	const text = (value?: string) => value?.trim().toLowerCase() || undefined;
	return {
		department: text(filters.department),
		location: text(filters.location),
		employmentType: filters.employmentType,
		remote: filters.remote,
		search: text(filters.search),
		limit: filters.limit ?? 12,
		offset: filters.offset ?? 0,
	};
}

/** Shared public query keys for resource hooks and direct SSG prefetching. */
export const JOB_BOARD_QUERY_KEYS = {
	list: (filters: JobsFilters = {}) =>
		["jobBoardJobs", "list", jobsListDiscriminator(filters)] as const,
	detail: (slug: string) => ["jobBoardJobs", "detail", slug] as const,
	taxonomies: () => ["jobBoardJobs", "taxonomies", "all"] as const,
};
