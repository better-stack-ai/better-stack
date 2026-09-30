"use client";

import { lazy, type ComponentType } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_PLUGIN_ID } from "../../constants";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { PostLoading } from "../loading";
import { NotFoundPage } from "./404-page";
import { useSuspensePost } from "../../hooks/blog-hooks";
import { blogPermissions } from "../../../permissions";

// Share the guarded page between the lazy registry and native route entry.
export function createPostPage(
	PostPageContent: ComponentType<{ slug: string }>,
) {
	function AuthorizedPostPage({ slug }: { slug: string }) {
		const { post } = useSuspensePost(slug);
		const permission = post
			? blogPermissions.post.read({
					scope: "post",
					slug: post.slug,
					exists: true,
					id: post.id,
					...(post.authorId ? { authorId: post.authorId } : {}),
					published: post.published,
				})
			: blogPermissions.post.read({
					scope: "post",
					slug,
					exists: false,
					published: false,
				});
		return (
			<PermissionRouteAccess
				permission={permission}
				LoadingComponent={PostLoading}
			>
				<PostPageContent slug={slug} />
			</PermissionRouteAccess>
		);
	}

	// Exported wrapped component with error and loading boundaries
	function PostPageComponent({ slug }: { slug: string }) {
		const { onRouteError } =
			usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
		return (
			<ComposedRoute
				path={`/blog/${slug}`}
				PageComponent={AuthorizedPostPage}
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

	return PostPageComponent;
}

export const PostPageComponent = createPostPage(
	lazy(() =>
		import("./post-page.internal").then((m) => ({ default: m.PostPage })),
	),
);
