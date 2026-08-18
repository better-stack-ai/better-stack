"use client";

import {
	useBasePath,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import type { SerializedPost } from "../../../types";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "@workspace/ui/components/carousel";
import { PostCard as DefaultPostCard } from "./post-card";
import { DefaultLink } from "./defaults";

interface RecentPostsCarouselProps {
	posts: SerializedPost[];
}

export function RecentPostsCarousel({ posts }: RecentPostsCarouselProps) {
	const t = useTranslate();
	const { PostCard, Link, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		PostCard: DefaultPostCard,
		Link: DefaultLink,
	});
	const PostCardComponent = PostCard || DefaultPostCard;
	const basePath = useBasePath();
	return (
		<div className="w-full">
			{posts && posts.length > 0 && (
				<>
					<div className="mt-4 py-4 w-full text-start border-t">
						<div className="mt-4 flex items-center justify-between">
							<h2 className="text-xl font-semibold">
								{localization?.BLOG_POST_KEEP_READING ??
									t("blog.post.keepReading", "Keep Reading")}
							</h2>
							<Link
								href={`${basePath}/blog`}
								className="text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								{localization?.BLOG_POST_VIEW_ALL ??
									t("blog.post.viewAll", "View all")}
							</Link>
						</div>
					</div>
					<div data-testid="recent-posts-carousel">
						<Carousel
							opts={{
								align: "start",
								loop: false,
							}}
							className="w-full"
						>
							<CarouselContent className="-ml-2 md:-ml-4">
								{posts.map((post) => (
									<CarouselItem
										key={post.id}
										className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/3"
									>
										<PostCardComponent post={post} />
									</CarouselItem>
								))}
							</CarouselContent>
							<CarouselPrevious className="-left-4 z-50 hover:cursor-pointer" />
							<CarouselNext className="-right-4 z-50 hover:cursor-pointer" />
						</Carousel>
					</div>
				</>
			)}
		</div>
	);
}
