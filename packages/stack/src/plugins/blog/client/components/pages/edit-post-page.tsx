"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { ComposedRoute } from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormLoading } from "../loading";
import { NotFoundPage } from "./404-page";

// Lazy load the internal component with actual page content
const EditPostPage = lazy(() =>
	import("./edit-post-page.internal").then((m) => ({
		default: m.EditPostPage,
	})),
);

// Exported wrapped component with error and loading boundaries
export function EditPostPageComponent({ slug }: { slug: string }) {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
	return (
		<ComposedRoute
			path={`/blog/${slug}/edit`}
			PageComponent={EditPostPage}
			ErrorComponent={DefaultError}
			LoadingComponent={FormLoading}
			NotFoundComponent={NotFoundPage}
			props={{ slug }}
			onError={(error) => {
				if (onRouteError) {
					onRouteError("editPost", error, {
						path: `/blog/${slug}/edit`,
						isSSR: typeof window === "undefined",
						slug,
					});
				}
			}}
		/>
	);
}
