"use client";

import { lazy, Suspense } from "react";
import { FormBuilderSkeleton } from "../loading/form-builder-skeleton";
import { ErrorBoundary } from "react-error-boundary";
import { DefaultError } from "../shared/default-error";

const FormBuilderPage = lazy(() =>
	import("./form-builder-page.internal").then((m) => ({
		default: m.FormBuilderPage,
	})),
);

export interface FormBuilderPageProps {
	id?: string;
}

export function FormBuilderPageComponent({ id }: FormBuilderPageProps) {
	return (
		<ErrorBoundary FallbackComponent={DefaultError}>
			<Suspense fallback={<FormBuilderSkeleton />}>
				<FormBuilderPage id={id} />
			</Suspense>
		</ErrorBoundary>
	);
}
