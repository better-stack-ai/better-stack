"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
import { schoolPermissions } from "../../../permissions";
const Page = lazy(() =>
	import("./quiz-page.internal").then((m) => ({ default: m.QuizPage })),
);
export function QuizPageComponent({
	slug,
	lessonId,
}: {
	slug: string;
	lessonId: string;
}) {
	return (
		<ComposedRoute
			path={`/learn/${slug}/lessons/${lessonId}/quiz`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ slug, lessonId }}
			permission={schoolPermissions.enrollment.read({ scope: "own" })}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
