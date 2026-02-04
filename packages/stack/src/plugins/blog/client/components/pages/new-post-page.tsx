"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const NewPostPage = lazy(() =>
	import("./new-post-page.internal").then((m) => ({ default: m.NewPostPage })),
);

// Exported wrapped component with error and loading boundaries
export function NewPostPageComponent() {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
	return (
		<ComposedRoute
			path="/blog/new"
			PageComponent={NewPostPage}
			ErrorComponent={DefaultError}
			LoadingComponent={FormLoading}
			NotFoundComponent={NotFoundPage}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("newPost", error, {
						path: `/blog/new`,
						isSSR: typeof window === "undefined",
					});
				}
			}}
		/>
	);
}
