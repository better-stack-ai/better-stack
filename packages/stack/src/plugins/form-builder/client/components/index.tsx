"use client";

import { FormListPageComponent as FormListPageImpl } from "./pages/form-list-page";
import { FormBuilderPageComponent as FormBuilderPageImpl } from "./pages/form-builder-page";
import { SubmissionsPageComponent as SubmissionsPageImpl } from "./pages/submissions-page";
import { FormRenderer as FormRendererImpl } from "./forms/form-renderer";

// Re-export to ensure the client boundary is preserved
export const FormListPage = FormListPageImpl;
export const FormBuilderPage = FormBuilderPageImpl;
export const SubmissionsPage = SubmissionsPageImpl;
export const FormRenderer = FormRendererImpl;

// Export loading skeletons
export {
	FormListSkeleton,
	FormBuilderSkeleton,
	SubmissionsSkeleton,
} from "./loading";

// Export shared components
export { DefaultError } from "./shared/default-error";
export { EmptyState } from "./shared/empty-state";
export { NotFoundPage } from "./pages/404-page";
