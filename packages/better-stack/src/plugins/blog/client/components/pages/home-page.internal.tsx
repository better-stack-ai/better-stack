"use client";

import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import { PostsList } from "../shared/posts-list";
import { TagsList } from "../shared/tags-list";

import { useSuspensePosts } from "../../hooks/blog-hooks";
import { BLOG_LOCALIZATION } from "../../localization";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

// Internal component with actual page content
export function HomePage({ published }: { published: boolean }) {
	const overrides = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const { localization } = overrides;

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: published ? "posts" : "drafts",
		context: {
			path: published ? "/blog" : "/blog/drafts",
			isSSR: typeof window === "undefined",
			published,
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (published && overrides.onBeforePostsPageRendered) {
				return overrides.onBeforePostsPageRendered(context);
			}
			if (!published && overrides.onBeforeDraftsPageRendered) {
				return overrides.onBeforeDraftsPageRendered(context);
			}
			return true;
		},
	});

	return (
		<PageWrapper testId={published ? "home-page" : "drafts-home-page"}>
			<div className="flex flex-col items-center gap-3">
				<PageHeader
					title={
						published
							? localization.BLOG_LIST_TITLE
							: localization.BLOG_LIST_DRAFTS_TITLE
					}
					childrenBottom={<TagsList />}
				/>
			</div>
			<Content published={published} />
		</PageWrapper>
	);
}

function Content({ published }: { published: boolean }) {
	const { posts, loadMore, hasMore, isLoadingMore } = useSuspensePosts({
		published: published,
	});
	return (
		<PostsList
			posts={posts}
			onLoadMore={loadMore}
			hasMore={hasMore}
			isLoadingMore={isLoadingMore}
		/>
	);
}
