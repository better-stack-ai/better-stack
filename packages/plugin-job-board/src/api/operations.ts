import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { jobBoardPermissions } from "../permissions";
import { jobsQuerySchema } from "../schemas";
import type { Job, JobsPage, JobTaxonomies } from "../types";
import { getJobTaxonomies, paginateJobs, toPublicJobs } from "../utils";
import { getStoredJobItems, resolveJobApplication } from "./getters";
import { archiveExpiredJobs } from "./mutations";

/** @internal Public reads lazily persist closing-date archival before projecting visible jobs. */
export async function loadCurrentJobs(adapter: Adapter): Promise<Job[]> {
	const now = new Date();
	const items = await getStoredJobItems(adapter);
	await archiveExpiredJobs(adapter, items, now);
	return toPublicJobs(items, now);
}

/** Single maintained inventory for public HTTP reads and trusted server jobs. */
export function createJobBoardOperations(
	adapter: Adapter,
	formBuilderAvailable: boolean,
) {
	return {
		listJobs: defineOperation({
			input: jobsQuerySchema,
			permission: jobBoardPermissions.job.read,
			facts: () => ({ scope: "collection" as const }),
			execute: async ({ input }): Promise<JobsPage> =>
				paginateJobs(await loadCurrentJobs(adapter), input),
		}),
		getJobTaxonomies: defineOperation({
			input: z.object({}),
			permission: jobBoardPermissions.job.read,
			facts: () => ({ scope: "collection" as const }),
			execute: async (): Promise<JobTaxonomies> =>
				getJobTaxonomies(await loadCurrentJobs(adapter)),
		}),
		getJob: defineOperation({
			input: z.object({ slug: z.string().min(1).max(200) }),
			permission: jobBoardPermissions.job.read,
			facts: ({ input }) => ({ scope: "record" as const, slug: input.slug }),
			execute: async ({ input }): Promise<Job> => {
				const job = (await loadCurrentJobs(adapter)).find(
					(item) => item.slug === input.slug,
				);
				if (!job)
					throw new OperationHttpError(404, "Job not found", "JOB_NOT_FOUND");
				return formBuilderAvailable ? resolveJobApplication(adapter, job) : job;
			},
		}),
		getAllJobs: defineOperation({
			input: z.object({}),
			permission: jobBoardPermissions.job.read,
			facts: () => ({ scope: "collection" as const }),
			execute: async (): Promise<Job[]> => loadCurrentJobs(adapter),
		}),
	};
}
