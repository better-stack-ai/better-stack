"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
const Page = lazy(() =>
	import("./lesson-player-page.internal").then((m) => ({
		default: m.LessonPlayerPage,
	})),
);
export function LessonPlayerPageComponent({
	slug,
	lessonId,
}: {
	slug: string;
	lessonId: string;
}) {
	return (
		<ComposedRoute
			path={`/learn/${slug}/lessons/${lessonId}`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ slug, lessonId }}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
