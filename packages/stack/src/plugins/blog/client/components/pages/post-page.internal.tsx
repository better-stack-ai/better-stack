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
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { OnThisPage, OnThisPageSelect } from "../shared/on-this-page";
import type { SerializedPost } from "../../../types";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { WhenVisible } from "@workspace/ui/components/when-visible";
import { PostNavigationSkeleton } from "../loading/post-navigation-skeleton";
import { RecentPostsCarouselSkeleton } from "../loading/recent-posts-carousel-skeleton";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const MAX_VISIBLE_POST_TAGS = 15;

// Internal component with actual page content
export function PostPage({ slug }: { slug: string }) {
	const overrides = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Image: DefaultImage,
		localization: BLOG_LOCALIZATION,
	});
	const { Image, localization } = overrides;

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "post",
		context: {
			path: `/blog/${slug}`,
			params: { slug },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforePostPageRendered) {
				return overrides.onBeforePostPageRendered(slug, context);
			}
			return true;
		},
	});

	const { post } = useSuspensePost(slug ?? "");

	const { previousPost, nextPost } = useNextPreviousPosts(
		post?.createdAt ?? new Date(),
		{
			enabled: !!post,
		},
	);

	const { recentPosts } = useRecentPosts({
		limit: 5,
		excludeSlug: slug,
		enabled: !!post,
	});

	// Register page AI context so the chat can summarize and discuss this post
	useRegisterPageAIContext(
		post
			? {
					routeName: "blog-post",
					pageDescription:
						`Blog post: "${post.title}"\nAuthor: ${post.authorId ?? "Unknown"}\n\n${post.content ?? ""}`.slice(
							0,
							16000,
						),
					suggestions: [
						"Summarize this post",
						"What are the key takeaways?",
						"Explain this in simpler terms",
					],
				}
			: null,
	);

	if (!slug || !post) {
		return (
			<PageWrapper>
				<EmptyList message={localization.BLOG_PAGE_NOT_FOUND_DESCRIPTION} />
			</PageWrapper>
		);
	}

	return (
		<PageWrapper className="gap-0 px-4 lg:px-2 py-0 pb-18" testId="post-page">
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
						<WhenVisible
							rootMargin="200px"
							fallback={<PostNavigationSkeleton />}
						>
							<PostNavigation previousPost={previousPost} nextPost={nextPost} />
						</WhenVisible>

						<WhenVisible
							rootMargin="200px"
							fallback={<RecentPostsCarouselSkeleton />}
						>
							<RecentPostsCarousel posts={recentPosts} />
						</WhenVisible>

						{overrides.postBottomSlot && (
							<div data-testid="post-bottom-slot">
								{overrides.postBottomSlot(post)}
							</div>
						)}
					</div>
				</div>
				<OnThisPage markdown={post.content} />
			</div>
		</PageWrapper>
	);
}

function PostHeaderTop({ post }: { post: SerializedPost }) {
	const { Link, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Link: DefaultLink,
		localization: BLOG_LOCALIZATION,
	});
	const basePath = useBasePath();
	const [showAll, setShowAll] = useState(false);

	const allTags = post.tags ?? [];
	const hasMore = allTags.length > MAX_VISIBLE_POST_TAGS;
	const visibleTags =
		showAll || !hasMore ? allTags : allTags.slice(0, MAX_VISIBLE_POST_TAGS);

	return (
		<div className="flex flex-row items-center justify-center gap-2 flex-wrap mt-8">
			<span className="font-light text-muted-foreground text-sm">
				{formatDate(post.createdAt, "MMMM d, yyyy")}
			</span>
			{visibleTags.map((tag) => (
				<Link key={tag.id} href={`${basePath}/blog/tag/${tag.slug}`}>
					<Badge variant="secondary" className="text-xs">
						{tag.name}
					</Badge>
				</Link>
			))}
			{hasMore && (
				<Badge asChild variant="secondary" className="text-xs cursor-pointer">
					<button
						type="button"
						onClick={() => setShowAll((prev) => !prev)}
						aria-expanded={showAll}
						aria-label={
							showAll
								? localization.BLOG_TAGS_SHOW_LESS
								: localization.BLOG_TAGS_SHOW_ALL
						}
						title={
							showAll
								? localization.BLOG_TAGS_SHOW_LESS
								: localization.BLOG_TAGS_SHOW_ALL
						}
					>
						{showAll ? (
							<ChevronUp aria-hidden="true" />
						) : (
							<ChevronDown aria-hidden="true" />
						)}
					</button>
				</Badge>
			)}
		</div>
	);
}
