"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
import { schoolPermissions } from "../../../permissions";
const Page = lazy(() =>
	import("./lesson-editor-page.internal").then((m) => ({
		default: m.LessonEditorPage,
	})),
);
export function LessonEditorPageComponent({
	id,
	lessonId,
}: {
	id: string;
	lessonId: string;
}) {
	return (
		<ComposedRoute
			path={`/learn/instructor/courses/${id}/lessons/${lessonId}`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ id, lessonId }}
			permission={schoolPermissions.course.read({ scope: "instructor" })}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
