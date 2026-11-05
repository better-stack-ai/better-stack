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
import { useJobs, useJob } from "@btst/plugin-job-board/client/hooks";
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
