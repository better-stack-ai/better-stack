"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import { PageListSkeleton } from "../loading/page-list-skeleton";
import { DefaultError } from "../shared/default-error";
import type { UIBuilderPluginOverrides } from "../../overrides";

const PageListPageInternal = lazy(() =>
	import("./page-list-page.internal").then((m) => ({
		default: m.PageListPage,
	})),
);

export function PageListPage() {
	const { onRouteError } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");

	return (
		<ComposedRoute
			path="/ui-builder"
			permission={{ resource: "ui-builder:page", action: "read" }}
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
