"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { SubmissionsSkeleton } from "../loading/submissions-skeleton";
import { NotFoundPage } from "./404-page";
import { formBuilderPermissions } from "../../../permissions";
import { useSuspenseFormById } from "../../hooks";

const SubmissionsPage = lazy(() =>
	import("./submissions-page.internal").then((m) => ({
		default: m.SubmissionsPage,
	})),
);

export interface SubmissionsPageProps {
	formId: string;
}

export function SubmissionsPageComponent({ formId }: SubmissionsPageProps) {
	const { onRouteError } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

	const path = `/forms/${formId}/submissions`;

	return (
		<ComposedRoute
			path={path}
			PageComponent={AuthorizedSubmissionsPage}
			ErrorComponent={DefaultError}
			LoadingComponent={SubmissionsSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ formId }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("submissions", error, {
						path,
						params: { formId },
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}

function AuthorizedSubmissionsPage({ formId }: SubmissionsPageProps) {
	const { form } = useSuspenseFormById(formId);
	return (
		<PermissionRouteAccess
			permission={formBuilderPermissions.submission.read({
				scope: "collection",
				formId,
				formExists: form !== null,
				...(form?.createdBy ? { ownerId: form.createdBy } : {}),
			})}
			legacyPermission={{
				resource: "form-builder:submission",
				action: "read",
				params: { formId },
			}}
			LoadingComponent={SubmissionsSkeleton}
		>
			<SubmissionsPage formId={formId} />
		</PermissionRouteAccess>
	);
}
