"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormBuilderSkeleton } from "../loading/form-builder-skeleton";
import { NotFoundPage } from "./404-page";
import { formBuilderPermissions } from "../../../permissions";
import { useSuspenseFormById } from "../../hooks";

const FormBuilderPage = lazy(() =>
	import("./form-builder-page.internal").then((m) => ({
		default: m.FormBuilderPage,
	})),
);

export interface FormBuilderPageProps {
	id?: string;
}

export function FormBuilderPageComponent({ id }: FormBuilderPageProps) {
	const { onRouteError } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

	const isNew = !id;
	const path = isNew ? "/forms/new" : `/forms/${id}/edit`;

	return (
		<ComposedRoute
			path={path}
			PageComponent={AuthorizedFormBuilderPage}
			ErrorComponent={DefaultError}
			LoadingComponent={FormBuilderSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ id }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("formBuilder", error, {
						path,
						params: id ? { id } : {},
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}

function AuthorizedFormBuilderPage({ id }: FormBuilderPageProps) {
	if (!id) {
		return (
			<PermissionRouteAccess
				permission={formBuilderPermissions.form.create()}
				legacyPermission={{ resource: "form-builder:form", action: "create" }}
				LoadingComponent={FormBuilderSkeleton}
			>
				<FormBuilderPage />
			</PermissionRouteAccess>
		);
	}
	return <AuthorizedExistingFormBuilderPage id={id} />;
}

function AuthorizedExistingFormBuilderPage({ id }: { id: string }) {
	const { form } = useSuspenseFormById(id);
	if (!form) return <NotFoundPage />;
	return (
		<PermissionRouteAccess
			permission={formBuilderPermissions.form.update({
				formId: form.id,
				...(form.createdBy ? { ownerId: form.createdBy } : {}),
				status: form.status,
			})}
			legacyPermission={{
				resource: "form-builder:form",
				action: "update",
				params: { id: form.id },
			}}
			LoadingComponent={FormBuilderSkeleton}
		>
			<FormBuilderPage id={id} />
		</PermissionRouteAccess>
	);
}
