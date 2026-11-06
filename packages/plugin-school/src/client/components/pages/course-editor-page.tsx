"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
import { schoolPermissions } from "../../../permissions";
const Page = lazy(() =>
	import("./course-editor-page.internal").then((m) => ({
		default: m.CourseEditorPage,
	})),
);
export function CourseEditorPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			path={`/learn/instructor/courses/${id}`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ id }}
			permission={schoolPermissions.course.read({ scope: "instructor" })}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
