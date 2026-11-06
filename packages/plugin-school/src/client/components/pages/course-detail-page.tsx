"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
const Page = lazy(() =>
	import("./course-detail-page.internal").then((m) => ({
		default: m.CourseDetailPage,
	})),
);
export function CourseDetailPageComponent({ slug }: { slug: string }) {
	return (
		<ComposedRoute
			path={`/learn/${slug}`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ slug }}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
