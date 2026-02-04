"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { PostsLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const TagPage = lazy(() =>
	import("./tag-page.internal").then((m) => ({ default: m.TagPage })),
);

// Exported wrapped component with error and loading boundaries
export function TagPageComponent({ tagSlug }: { tagSlug: string }) {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
	return (
		<ComposedRoute
			path={`/blog/tag/${tagSlug}`}
			PageComponent={TagPage}
			ErrorComponent={DefaultError}
			LoadingComponent={PostsLoading}
			NotFoundComponent={NotFoundPage}
			props={{ tagSlug }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("tag", error, {
						path: `/blog/tag/${tagSlug}`,
						isSSR: typeof window === "undefined",
						tagSlug,
					});
				}
			}}
		/>
	);
}
