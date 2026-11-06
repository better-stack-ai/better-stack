"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
const Page = lazy(() =>
	import("./course-list-page.internal").then((m) => ({
		default: m.CourseListPage,
	})),
);
export function CourseListPageComponent() {
	return (
		<ComposedRoute
			path={`/learn`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
