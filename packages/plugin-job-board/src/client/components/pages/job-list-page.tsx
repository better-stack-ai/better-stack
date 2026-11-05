"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { JobError, JobLoading, JobNotFound } from "../shared";

const JobList = lazy(() =>
	import("./job-list-page.internal").then((module) => ({
		default: module.JobListPage,
	})),
);

export function JobListPageComponent() {
	return (
		<ComposedRoute
			path="/jobs"
			PageComponent={JobList}
			ErrorComponent={JobError}
			LoadingComponent={JobLoading}
			NotFoundComponent={JobNotFound}
			onError={(error) => console.error("[btst/job-board]", error)}
		/>
	);
}
