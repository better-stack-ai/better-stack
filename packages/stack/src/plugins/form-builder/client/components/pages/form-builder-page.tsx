"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormBuilderSkeleton } from "../loading/form-builder-skeleton";
import { NotFoundPage } from "./404-page";

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
			PageComponent={FormBuilderPage}
			ErrorComponent={DefaultError}
			LoadingComponent={FormBuilderSkeleton}
			NotFoundComponent={NotFoundPage}
			permission={
				isNew
					? { resource: "form-builder:form", action: "create" }
					: { resource: "form-builder:form", action: "update", params: { id } }
			}
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
