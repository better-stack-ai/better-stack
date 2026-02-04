"use client";

import { lazy, Suspense } from "react";
import { PageListSkeleton } from "../loading/page-list-skeleton";
import { ErrorBoundary } from "react-error-boundary";
import { DefaultError } from "../shared/default-error";

const PageListPageInternal = lazy(() =>
	import("./page-list-page.internal").then((m) => ({
		default: m.PageListPage,
	})),
);

export function PageListPage() {
	return (
		<ErrorBoundary FallbackComponent={DefaultError}>
			<Suspense fallback={<PageListSkeleton />}>
				<PageListPageInternal />
			</Suspense>
		</ErrorBoundary>
	);
}
