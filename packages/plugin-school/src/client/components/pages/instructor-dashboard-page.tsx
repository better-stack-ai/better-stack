"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
import { schoolPermissions } from "../../../permissions";
const Page = lazy(() =>
	import("./instructor-dashboard-page.internal").then((m) => ({
		default: m.InstructorDashboardPage,
	})),
);
export function InstructorDashboardPageComponent() {
	return (
		<ComposedRoute
			path={`/learn/instructor`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			permission={schoolPermissions.course.read({ scope: "instructor" })}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
