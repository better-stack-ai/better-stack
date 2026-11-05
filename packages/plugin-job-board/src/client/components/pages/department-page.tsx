"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { encodeJobDepartment } from "../../../utils";
import { JobError, JobLoading, JobNotFound } from "../shared";

const JobList = lazy(() =>
	import("./job-list-page.internal").then((module) => ({
		default: module.JobListPage,
	})),
);

export function DepartmentPageComponent({
	department,
}: {
	department?: string;
}) {
	if (!department) return <JobNotFound />;
	return (
		<ComposedRoute
			path={`/jobs/department/${encodeJobDepartment(department)}`}
			PageComponent={JobList}
			ErrorComponent={JobError}
			LoadingComponent={JobLoading}
			NotFoundComponent={JobNotFound}
			onError={(error) => console.error("[btst/job-board]", error)}
			props={{ department }}
		/>
	);
}
