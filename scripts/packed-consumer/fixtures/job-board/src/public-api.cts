import root = require("@btst/plugin-job-board");
import api = require("@btst/plugin-job-board/api");
import client = require("@btst/plugin-job-board/client");
import types = require("@btst/plugin-job-board/types");
import queries = require("@btst/plugin-job-board/query-keys");

export type CommonJSJobBoard = {
	contentType: typeof root.JOB_BOARD_CONTENT_TYPE;
	backend: typeof api.jobBoardBackendPlugin;
	client: typeof client.jobBoardClientPlugin;
	job: types.Job;
	queries: typeof queries.createJobBoardQueryKeys;
};
