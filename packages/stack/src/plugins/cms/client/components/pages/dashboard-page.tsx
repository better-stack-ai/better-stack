"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { CMS_PLUGIN_ID } from "../../constants";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { DashboardSkeleton } from "../loading";
import { NotFoundPage } from "./404-page";
import { cmsPermissions } from "../../../permissions";

const DashboardPageInternal = lazy(() =>
	import("./dashboard-page.internal").then((m) => ({
		default: m.DashboardPage,
	})),
);

export function DashboardPageComponent() {
	const { onRouteError } =
		usePluginOverrides<CMSPluginOverrides>(CMS_PLUGIN_ID);

	return (
		<ComposedRoute
			path="/cms"
			permission={cmsPermissions.contentType.read({})}
			PageComponent={DashboardPageInternal}
			ErrorComponent={DefaultError}
			LoadingComponent={DashboardSkeleton}
			NotFoundComponent={NotFoundPage}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("dashboard", error, {
						path: "/cms",
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}
