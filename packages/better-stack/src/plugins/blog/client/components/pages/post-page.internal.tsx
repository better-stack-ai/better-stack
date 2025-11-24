"use client";

import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import { formatDate } from "date-fns";
import {
	useSuspensePost,
	useNextPreviousPosts,
	useRecentPosts,
} from "../../hooks/blog-hooks";
import { EmptyList } from "../shared/empty-list";
import { MarkdownContent } from "../shared/markdown-content";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import type { BlogPluginOverrides } from "../../overrides";
import { DefaultImage, DefaultLink } from "../shared/defaults";
import { BLOG_LOCALIZATION } from "../../localization";
import { PostNavigation } from "../shared/post-navigation";
import { RecentPostsCarousel } from "../shared/recent-posts-carousel";
import { Badge } from "@workspace/ui/components/badge";
import { useRouteLifecycle } from "../shared/use-route-lifecycle";
import { OnThisPage, OnThisPageSelect } from "../shared/on-this-page";
import type { SerializedPost } from "../../../types";

// Internal component with actual page content
export function PostPage({ slug }: { slug: string }) {
	const { Image, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Image: DefaultImage,
		localization: BLOG_LOCALIZATION,
	});

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "post",
		context: {
			path: `/blog/${slug}`,
			params: { slug },
			isSSR: typeof window === "undefined",
		},
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforePostPageRendered) {
				return overrides.onBeforePostPageRendered(slug, context);
			}
			return true;
		},
	});

	const { post } = useSuspensePost(slug ?? "");

	const { previousPost, nextPost, ref } = useNextPreviousPosts(
		post?.createdAt ?? new Date(),
		{
			enabled: !!post,
		},
	);

	const { recentPosts, ref: recentPostsRef } = useRecentPosts({
		limit: 5,
		excludeSlug: slug,
		enabled: !!post,
	});

	if (!slug || !post) {
		return (
			<PageWrapper>
				<EmptyList message={localization.BLOG_PAGE_NOT_FOUND_DESCRIPTION} />
			</PageWrapper>
		);
	}

	return (
		<PageWrapper className="gap-0 px-4 lg:px-4 py-0 pb-18" testId="post-page">
			<div className="flex items-start w-full">
				<div className="w-44 shrink-0 hidden xl:flex mr-auto" />
				<div className="flex flex-col items-center flex-1 mx-auto w-full max-w-4xl min-w-0">
					<OnThisPageSelect markdown={post.content} />

					<PageHeader
						title={post.title}
						description={post.excerpt}
						childrenTop={<PostHeaderTop post={post} />}
					/>

					{post.image && (
						<div className="flex flex-col gap-2 my-6 aspect-video w-full relative">
							<Image
								src={post.image}
								alt={post.title}
								className="object-cover transition-transform duration-200"
							/>
						</div>
					)}

					<div className="w-full px-3">
						<MarkdownContent markdown={post.content} />
					</div>

					<div className="flex flex-col gap-4 w-full">
						<PostNavigation
							previousPost={previousPost}
							nextPost={nextPost}
							ref={ref}
						/>

						<RecentPostsCarousel posts={recentPosts} ref={recentPostsRef} />
					</div>
				</div>
				<OnThisPage markdown={post.content} />
			</div>
		</PageWrapper>
	);
}

function PostHeaderTop({ post }: { post: SerializedPost }) {
	const { Link } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Link: DefaultLink,
	});
	const basePath = useBasePath();
	return (
		<div className="flex flex-row items-center justify-center gap-2 flex-wrap mt-8">
			<span className="font-light text-muted-foreground text-sm">
				{formatDate(post.createdAt, "MMMM d, yyyy")}
			</span>
			{post.tags && post.tags.length > 0 && (
				<>
					{post.tags.map((tag) => (
						<Link key={tag.id} href={`${basePath}/blog/tag/${tag.slug}`}>
							<Badge variant="secondary" className="text-xs">
								{tag.name}
							</Badge>
						</Link>
					))}
				</>
			)}
		</div>
	);
}
