import { createDbPlugin, type DBAdapter as Adapter } from "@btst/db";
import {
	createEndpoint,
	defineBackendPlugin,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { jobsQuerySchema } from "../schemas";
import type { JobsFilters } from "../types";
import { getJobTaxonomies, paginateJobs } from "../utils";
import { resolveJobApplication } from "./getters";
import { createJobBoardOperations, loadCurrentJobs } from "./operations";
import { JOB_BOARD_QUERY_KEYS } from "./query-key-defs";

/** Public page identities supported by direct CMS-backed SSG prefetching. */
export type JobBoardRouteKey = "list" | "detail" | "department";

interface JobBoardPrefetchForRoute {
	(key: "list", queryClient: QueryClient, filters?: JobsFilters): Promise<void>;
	(
		key: "department",
		queryClient: QueryClient,
		params: JobsFilters & { dept: string },
	): Promise<void>;
	(
		key: "detail",
		queryClient: QueryClient,
		params: { slug: string },
	): Promise<void>;
}

/** CMS-backed public read routes. The empty database plugin declares no tables or fields. */
export const jobBoardBackendPlugin = () => {
	const formAdapters = new WeakSet<Adapter>();
	return defineBackendPlugin({
		id: "jobBoard",
		dbPlugin: createDbPlugin("job-board", {}),
		operations: (adapter, context) => {
			const plugins = Object.values(context?.plugins ?? {});
			if (!plugins.some((plugin) => plugin.id === "cms"))
				throw new Error(
					"Job Board requires the CMS backend with JOB_BOARD_CONTENT_TYPE registered",
				);
			const hasForms = plugins.some((plugin) => plugin.id === "formBuilder");
			if (hasForms) formAdapters.add(adapter);
			return createJobBoardOperations(adapter, hasForms);
		},
		raw: (adapter) => ({
			prefetchForRoute: (async (
				key: JobBoardRouteKey,
				queryClient: QueryClient,
				params?: JobsFilters & { dept?: string; slug?: string },
			) => {
				const jobs = await loadCurrentJobs(adapter);
				if (key === "detail") {
					const job = jobs.find((item) => item.slug === params?.slug);
					if (!job)
						throw new OperationHttpError(404, "Job not found", "JOB_NOT_FOUND");
					queryClient.setQueryData(
						JOB_BOARD_QUERY_KEYS.detail(job.slug),
						formAdapters.has(adapter)
							? await resolveJobApplication(adapter, job)
							: job,
					);
					return;
				}
				const filters = jobsQuerySchema.parse({
					...params,
					...(key === "department" ? { department: params?.dept } : {}),
				});
				const page = paginateJobs(jobs, filters);
				queryClient.setQueryData(JOB_BOARD_QUERY_KEYS.list(filters), {
					pages: [page],
					pageParams: [filters.offset],
				});
				queryClient.setQueryData(
					JOB_BOARD_QUERY_KEYS.taxonomies(),
					getJobTaxonomies(jobs),
				);
			}) as JobBoardPrefetchForRoute,
		}),
		routes: (_adapter, _context, operations) => ({
			listJobs: createEndpoint(
				"/jobs",
				{ method: "GET", query: jobsQuerySchema, requireRequest: true },
				operations.listJobs.route((context) => context.query),
			),
			getJobTaxonomies: createEndpoint(
				"/jobs/taxonomies",
				{ method: "GET", requireRequest: true },
				operations.getJobTaxonomies.route(() => ({})),
			),
			getJob: createEndpoint(
				"/jobs/:slug",
				{ method: "GET", requireRequest: true },
				operations.getJob.route((context) => ({ slug: context.params.slug })),
			),
		}),
	});
};

/** Routes of the public CMS-backed Job Board API. */
export type JobBoardApiRouter = ReturnType<
	ReturnType<typeof jobBoardBackendPlugin>["routes"]
>;
