import {
	JOB_BOARD_CONTENT_TYPE,
	jobSchema,
	encodeJobDepartment,
} from "@btst/plugin-job-board";
import {
	jobBoardBackendPlugin,
	getAllJobs,
	type JobBoardApiRouter,
} from "@btst/plugin-job-board/api";
import {
	jobBoardClientPlugin,
	type JobBoardPluginOverrides,
} from "@btst/plugin-job-board/client";
import { JobDetailPageComponent } from "@btst/plugin-job-board/client/components";
import {
	useJobs,
	useSuspenseJobs,
	useJob,
	useSuspenseJob,
	useJobTaxonomies,
} from "@btst/plugin-job-board/client/hooks";
import { createJobBoardQueryKeys } from "@btst/plugin-job-board/query-keys";
import { jobBoardPermissions } from "@btst/plugin-job-board/permissions";
import type { Job, JobsPage } from "@btst/plugin-job-board/types";

export type PackedJobBoard = {
	config: typeof JOB_BOARD_CONTENT_TYPE;
	schema: typeof jobSchema;
	department: typeof encodeJobDepartment;
	backend: typeof jobBoardBackendPlugin;
	getter: typeof getAllJobs;
	router: JobBoardApiRouter;
	client: typeof jobBoardClientPlugin;
	overrides: JobBoardPluginOverrides;
	component: typeof JobDetailPageComponent;
	hooks: [typeof useJobs, typeof useJob];
	query: typeof createJobBoardQueryKeys;
	permissions: typeof jobBoardPermissions;
	job: Job;
	page: JobsPage;
};

export function usePublicJobData() {
	const page = useSuspenseJobs().data.pages[0];
	const jobs: Job[] | undefined = page?.items;
	const total: number | undefined = page?.total;
	const departments: string[] | undefined = page?.taxonomies.departments;
	const optionalPage: JobsPage | undefined = useJobs().data?.pages[0];
	const title: string | undefined = useJob("existing-role").data?.title;
	const job: Job = useSuspenseJob("existing-role").data;
	const locations: string[] | undefined = useJobTaxonomies().data?.locations;
	// @ts-expect-error Public job pages have no renamed count field.
	page?.count;
	// @ts-expect-error A job title remains a string.
	const _invalidTitle: number | undefined = useJob("existing-role").data?.title;
	// @ts-expect-error Taxonomies expose locations, not a single location.
	useJobTaxonomies().data?.location;
	return { jobs, total, departments, optionalPage, title, job, locations };
}
