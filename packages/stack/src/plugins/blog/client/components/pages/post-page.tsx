"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { PostLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const PostPage = lazy(() =>
	import("./post-page.internal").then((m) => ({ default: m.PostPage })),
);

// Exported wrapped component with error and loading boundaries
export function PostPageComponent({ slug }: { slug: string }) {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
	return (
		<ComposedRoute
			path={`/blog/${slug}`}
			PageComponent={PostPage}
			ErrorComponent={DefaultError}
			LoadingComponent={PostLoading}
			NotFoundComponent={NotFoundPage}
			props={{ slug }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("post", error, {
						path: `/blog/${slug}`,
						isSSR: typeof window === "undefined",
						slug,
					});
				}
			}}
		/>
	);
}
