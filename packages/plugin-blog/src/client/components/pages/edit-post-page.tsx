"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_PLUGIN_ID } from "../../constants";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { FormLoading } from "../loading";
import { NotFoundPage } from "./404-page";
import { useSuspensePost } from "../../hooks/blog-hooks";
import { blogPermissions } from "../../../permissions";

// Lazy load the internal component with actual page content
const EditPostPageContent = lazy(() =>
	import("./edit-post-page.internal").then((m) => ({
		default: m.EditPostPage,
	})),
);

function AuthorizedEditPostPage({ slug }: { slug: string }) {
	const { post } = useSuspensePost(slug);
	if (!post) return <EditPostPageContent slug={slug} />;
	return (
		<PermissionRouteAccess
			permission={blogPermissions.post.update({
				id: post.id,
				...(post.authorId ? { authorId: post.authorId } : {}),
				publish: "unchanged",
			})}
			LoadingComponent={FormLoading}
		>
			<EditPostPageContent slug={slug} />
		</PermissionRouteAccess>
	);
}

// Exported wrapped component with error and loading boundaries
export function EditPostPageComponent({ slug }: { slug: string }) {
	const { onRouteError } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
	return (
		<ComposedRoute
			path={`/blog/${slug}/edit`}
			PageComponent={AuthorizedEditPostPage}
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
