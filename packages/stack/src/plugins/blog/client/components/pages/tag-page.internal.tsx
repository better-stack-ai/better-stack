"use client";

import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import { PostsList } from "../shared/posts-list";
import { EmptyList } from "../shared/empty-list";

import { useSuspensePosts } from "../../hooks/blog-hooks";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { useTags } from "../../hooks/blog-hooks";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

// Internal component with actual page content
export function TagPage({ tagSlug }: { tagSlug: string }) {
	const t = useTranslate();
	const overrides = usePluginOverrides<BlogPluginOverrides>("blog");
	const { localization } = overrides;

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "tag",
		context: {
			path: `/blog/tag/${tagSlug}`,
			params: { tagSlug },
			isSSR: typeof window === "undefined",
		},
		overrides,
	});

	const { tags } = useTags();
	const tag = tags?.find((t) => t.slug === tagSlug);

	if (!tag) {
		return (
			<PageWrapper testId="tag-page">
				<div className="flex flex-col items-center gap-3">
					<PageHeader
						title={
							localization?.BLOG_TAG_NOT_FOUND ??
							t("blog.list.tagNotFound", "Tag not found")
						}
					/>
				</div>
				<EmptyList
					message={
						localization?.BLOG_TAG_NOT_FOUND_DESCRIPTION ??
						t(
							"blog.list.tagNotFoundDescription",
							"The tag you are looking for does not exist.",
						)
					}
				/>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper testId="tag-page">
			<div className="flex flex-col items-center gap-3">
				<PageHeader
					title={
						localization?.BLOG_TAG_PAGE_TITLE
							? localization.BLOG_TAG_PAGE_TITLE.replace("{tag}", tag.name)
							: t("blog.list.tagPageTitle", "{{tag}} Posts", { tag: tag.name })
					}
					description={
						localization?.BLOG_TAG_PAGE_DESCRIPTION ??
						t("blog.list.tagPageDescription", "Browse all posts with this tag")
					}
				/>
			</div>
			<Content tagSlug={tagSlug} />
		</PageWrapper>
	);
}

function Content({ tagSlug }: { tagSlug: string }) {
	const { posts, loadMore, hasMore, isLoadingMore } = useSuspensePosts({
		published: true,
		tagSlug: tagSlug,
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
