"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormListSkeleton } from "../loading/form-list-skeleton";
import { NotFoundPage } from "./404-page";
import { formBuilderPermissions } from "../../../permissions";

const FormListPage = lazy(() =>
	import("./form-list-page.internal").then((m) => ({
		default: m.FormListPage,
	})),
);

export function FormListPageComponent() {
	const { onRouteError } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");

	return (
		<ComposedRoute
			path="/forms"
			permission={formBuilderPermissions.form.read({ scope: "collection" })}
			PageComponent={FormListPage}
			ErrorComponent={DefaultError}
			LoadingComponent={FormListSkeleton}
			NotFoundComponent={NotFoundPage}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("formList", error, {
						path: "/forms",
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}
