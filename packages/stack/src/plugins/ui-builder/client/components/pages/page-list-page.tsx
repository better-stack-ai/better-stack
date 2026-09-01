"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import { PageListSkeleton } from "../loading/page-list-skeleton";
import { DefaultError } from "../shared/default-error";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { UI_BUILDER_PLUGIN_ID } from "../../constants";
import { cmsPermissions } from "@btst/stack/plugins/cms/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";

const PageListPageInternal = lazy(() =>
	import("./page-list-page.internal").then((m) => ({
		default: m.PageListPage,
	})),
);

export function PageListPage() {
	const { onRouteError } =
		usePluginOverrides<UIBuilderPluginOverrides>(UI_BUILDER_PLUGIN_ID);

	return (
		<ComposedRoute
			path="/ui-builder"
			permission={cmsPermissions.record.read({
				contentType: UI_BUILDER_TYPE_SLUG,
				scope: "collection",
			})}
			PageComponent={PageListPageInternal}
			ErrorComponent={DefaultError}
			LoadingComponent={PageListSkeleton}
			NotFoundComponent={() => null}
			onError={(error) => {
				onRouteError?.("pageList", error, {
					path: "/ui-builder",
					isSSR: typeof window === "undefined",
				});
			}}
		/>
	);
}
