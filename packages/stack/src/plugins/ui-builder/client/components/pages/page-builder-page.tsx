"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import { PageBuilderSkeleton } from "../loading/page-builder-skeleton";
import { DefaultError } from "../shared/default-error";
import type { UIBuilderPluginOverrides } from "../../overrides";

const PageBuilderPageInternal = lazy(() =>
	import("./page-builder-page.internal").then((m) => ({
		default: m.PageBuilderPage,
	})),
);

export interface PageBuilderPageProps {
	id?: string;
}

export function PageBuilderPage({ id }: PageBuilderPageProps) {
	const { onRouteError } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const path = id ? `/ui-builder/${id}/edit` : "/ui-builder/new";

	return (
		<ComposedRoute
			path={path}
			permission={
				id
					? { resource: "ui-builder:page", action: "update", params: { id } }
					: { resource: "ui-builder:page", action: "create" }
			}
			PageComponent={PageBuilderPageInternal}
			ErrorComponent={DefaultError}
			LoadingComponent={PageBuilderSkeleton}
			NotFoundComponent={() => null}
			props={{ id }}
			onError={(error) => {
				onRouteError?.("pageBuilder", error, {
					path,
					params: id ? { id } : {},
					isSSR: typeof window === "undefined",
				});
			}}
		/>
	);
}
