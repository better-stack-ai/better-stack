"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
import { schoolPermissions } from "../../../permissions";
const Page = lazy(() =>
	import("./my-courses-page.internal").then((m) => ({
		default: m.MyCoursesPage,
	})),
);
export function MyCoursesPageComponent() {
	return (
		<ComposedRoute
			path={`/learn/me`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			permission={schoolPermissions.enrollment.read({ scope: "own" })}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
