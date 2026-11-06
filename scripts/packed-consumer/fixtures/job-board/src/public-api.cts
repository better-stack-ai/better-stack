import root = require("@btst/plugin-job-board");
import api = require("@btst/plugin-job-board/api");
import client = require("@btst/plugin-job-board/client");
import types = require("@btst/plugin-job-board/types");
import queries = require("@btst/plugin-job-board/query-keys");
import hooks = require("@btst/plugin-job-board/client/hooks");

export type CommonJSJobBoard = {
	contentType: typeof root.JOB_BOARD_CONTENT_TYPE;
	backend: typeof api.jobBoardBackendPlugin;
	client: typeof client.jobBoardClientPlugin;
	job: types.Job;
	queries: typeof queries.createJobBoardQueryKeys;
};

export function usePublicJobData() {
	const page = hooks.useSuspenseJobs().data.pages[0];
	const jobs: types.Job[] | undefined = page?.items;
	const total: number | undefined = page?.total;
	const departments: string[] | undefined = page?.taxonomies.departments;
	const optionalPage: types.JobsPage | undefined =
		hooks.useJobs().data?.pages[0];
	const title: string | undefined = hooks.useJob("existing-role").data?.title;
	const job: types.Job = hooks.useSuspenseJob("existing-role").data;
	const locations: string[] | undefined =
		hooks.useJobTaxonomies().data?.locations;
	// @ts-expect-error Public job pages have no renamed count field.
	page?.count;
	// @ts-expect-error A job title remains a string.
	const _invalidTitle: number | undefined =
		hooks.useJob("existing-role").data?.title;
	// @ts-expect-error Taxonomies expose locations, not a single location.
	hooks.useJobTaxonomies().data?.location;
	return { jobs, total, departments, optionalPage, title, job, locations };
}
