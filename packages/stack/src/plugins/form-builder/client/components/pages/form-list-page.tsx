"use client";

import { lazy, Suspense } from "react";
import { FormListSkeleton } from "../loading/form-list-skeleton";
import { ErrorBoundary } from "react-error-boundary";
import { DefaultError } from "../shared/default-error";

const FormListPage = lazy(() =>
	import("./form-list-page.internal").then((m) => ({
		default: m.FormListPage,
	})),
);

export function FormListPageComponent() {
	return (
		<ErrorBoundary FallbackComponent={DefaultError}>
			<Suspense fallback={<FormListSkeleton />}>
				<FormListPage />
			</Suspense>
		</ErrorBoundary>
	);
}
