"use client";

import { lazy } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { DefaultError } from "../shared/default-error";
import { PostLoading } from "../loading";
import { NotFoundPage } from "./404-page";
import { useSuspensePost } from "../../hooks/blog-hooks";
import { blogPermissions } from "../../../permissions";

// Lazy load the internal component with actual page content
const PostPageContent = lazy(() =>
	import("./post-page.internal").then((m) => ({ default: m.PostPage })),
);

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
			legacyPublic={!post || post.published}
		>
			<PostPageContent slug={slug} />
		</PermissionRouteAccess>
	);
}

// Exported wrapped component with error and loading boundaries
export function PostPageComponent({ slug }: { slug: string }) {
	const { onRouteError } = usePluginOverrides<BlogPluginOverrides>("blog");
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
