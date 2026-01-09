"use client";

import { lazy, Suspense } from "react";
import { PageBuilderSkeleton } from "../loading/page-builder-skeleton";
import { ErrorBoundary } from "react-error-boundary";
import { DefaultError } from "../shared/default-error";

const PageBuilderPageInternal = lazy(() =>
	import("./page-builder-page.internal").then((m) => ({
		default: m.PageBuilderPage,
	})),
);

export interface PageBuilderPageProps {
	id?: string;
}

export function PageBuilderPage({ id }: PageBuilderPageProps) {
	return (
		<ErrorBoundary FallbackComponent={DefaultError}>
			<Suspense fallback={<PageBuilderSkeleton />}>
				<PageBuilderPageInternal id={id} />
			</Suspense>
		</ErrorBoundary>
	);
}
