"use client";

import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import { PostsList } from "../shared/posts-list";
import { TagsList } from "../shared/tags-list";

import { useSuspensePosts } from "../../hooks/blog-hooks";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_PLUGIN_ID } from "../../constants";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

// Internal component with actual page content
export function HomePage({ published }: { published: boolean }) {
	const t = useTranslate();
	const overrides = usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
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
	});

	return (
		<PageWrapper testId={published ? "home-page" : "drafts-home-page"}>
			<div className="flex flex-col items-center gap-3">
				<PageHeader
					title={
						published
							? (localization?.BLOG_LIST_TITLE ??
								t("blog.list.title", "Blog Posts"))
							: (localization?.BLOG_LIST_DRAFTS_TITLE ??
								t("blog.list.draftsTitle", "Draft Posts"))
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
