"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { JobError, JobLoading, JobNotFound } from "../shared";

const JobDetail = lazy(() =>
	import("./job-detail-page.internal").then((module) => ({
		default: module.JobDetailPage,
	})),
);

export function JobDetailPageComponent({ slug }: { slug: string }) {
	return (
		<ComposedRoute
			path={`/jobs/${slug}`}
			PageComponent={JobDetail}
			ErrorComponent={JobError}
			LoadingComponent={JobLoading}
			NotFoundComponent={JobNotFound}
			onError={(error) => console.error("[btst/job-board]", error)}
			props={{ slug }}
		/>
	);
}
