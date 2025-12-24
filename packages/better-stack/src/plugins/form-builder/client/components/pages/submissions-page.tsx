"use client";

import { lazy, Suspense } from "react";
import { SubmissionsSkeleton } from "../loading/submissions-skeleton";
import { ErrorBoundary } from "react-error-boundary";
import { DefaultError } from "../shared/default-error";

const SubmissionsPage = lazy(() =>
	import("./submissions-page.internal").then((m) => ({
		default: m.SubmissionsPage,
	})),
);

export interface SubmissionsPageProps {
	formId: string;
}

export function SubmissionsPageComponent({ formId }: SubmissionsPageProps) {
	return (
		<ErrorBoundary FallbackComponent={DefaultError}>
			<Suspense fallback={<SubmissionsSkeleton />}>
				<SubmissionsPage formId={formId} />
			</Suspense>
		</ErrorBoundary>
	);
}
