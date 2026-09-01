"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { CMS_PLUGIN_ID } from "../../constants";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { ListSkeleton } from "../loading";
import { NotFoundPage } from "./404-page";
import { cmsPermissions } from "../../../permissions";

const ContentListPageInternal = lazy(() =>
	import("./content-list-page.internal").then((m) => ({
		default: m.ContentListPage,
	})),
);

interface ContentListPageComponentProps {
	typeSlug: string;
}

export function ContentListPageComponent({
	typeSlug,
}: ContentListPageComponentProps) {
	const { onRouteError } =
		usePluginOverrides<CMSPluginOverrides>(CMS_PLUGIN_ID);

	return (
		<ComposedRoute
			path={`/cms/${typeSlug}`}
			permission={cmsPermissions.record.read({
				contentType: typeSlug,
				scope: "collection",
			})}
			PageComponent={ContentListPageInternal}
			ErrorComponent={DefaultError}
			LoadingComponent={ListSkeleton}
			NotFoundComponent={NotFoundPage}
			props={{ typeSlug }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("contentList", error, {
						path: `/cms/${typeSlug}`,
						params: { typeSlug },
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}
