"use client";

import { useBasePath, usePluginOverrides } from "@btst/stack/context";
import { EditPostForm } from "../forms/post-forms";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import { BLOG_LOCALIZATION } from "../../localization";
import type { BlogPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

// Internal component with actual page content
export function EditPostPage({ slug }: { slug: string }) {
	const overrides = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const { localization, navigate } = overrides;
	const basePath = useBasePath();

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "editPost",
		context: {
			path: `/blog/${slug}/edit`,
			params: { slug },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeEditPostPageRendered) {
				return overrides.onBeforeEditPostPageRendered(slug, context);
			}
			return true;
		},
	});

	const handleClose = () => {
		navigate(`${basePath}/blog`);
	};

	const handleSuccess = (post: { slug: string; published: boolean }) => {
		// Navigate based on published status
		navigate(`${basePath}/blog/${post.slug}`);
	};

	const handleDelete = () => {
		// Navigate to blog list after deletion
		navigate(`${basePath}/blog`);
	};

	return (
		<PageWrapper className="gap-6" testId="edit-post-page">
			<PageHeader
				title={localization.BLOG_POST_EDIT_TITLE}
				description={localization.BLOG_POST_EDIT_DESCRIPTION}
			/>
			<EditPostForm
				postSlug={slug}
				onClose={handleClose}
				onSuccess={handleSuccess}
				onDelete={handleDelete}
			/>
		</PageWrapper>
	);
}
