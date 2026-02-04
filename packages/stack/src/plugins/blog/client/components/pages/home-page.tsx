"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { PostsLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const HomePage = lazy(() =>
	import("./home-page.internal").then((m) => ({ default: m.HomePage })),
);

// Exported wrapped component with error and loading boundaries
export function HomePageComponent({
	published = true,
}: {
	published?: boolean;
}) {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
	return (
		<ComposedRoute
			path={published ? "/blog" : "/blog/drafts"}
			PageComponent={HomePage}
			ErrorComponent={DefaultError}
			LoadingComponent={PostsLoading}
			NotFoundComponent={NotFoundPage}
			props={{ published }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("posts", error, {
						path: published ? "/blog" : "/blog/drafts",
						isSSR: typeof window === "undefined",
						published,
					});
				}
			}}
		/>
	);
}
