import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { SerializedPost } from "../../../types";
import { Button } from "@workspace/ui/components/button";
import { EmptyList } from "./empty-list";
import { SearchInput } from "./search-input";
import type { BlogPluginOverrides } from "../../overrides";
import { PostCard as DefaultPostCard } from "./post-card";

interface PostsListProps {
	posts: SerializedPost[];
	onLoadMore?: () => void;
	hasMore?: boolean;
	isLoadingMore?: boolean;
}

export function PostsList({
	posts,
	onLoadMore,
	hasMore,
	isLoadingMore,
}: PostsListProps) {
	const t = useTranslate();
	const { localization, PostCard } =
		usePluginOverrides<BlogPluginOverrides>("blog");

	const PostCardComponent = PostCard || DefaultPostCard;
	if (posts.length === 0) {
		return (
			<EmptyList
				message={
					localization?.BLOG_LIST_EMPTY ??
					t("blog.list.empty", "There are no posts here yet.")
				}
			/>
		);
	}

	return (
		<div className="w-full space-y-6">
			<div className="flex justify-center pb-6">
				<SearchInput
					placeholder={
						localization?.BLOG_LIST_SEARCH_PLACEHOLDER ??
						t("blog.list.searchPlaceholder", "Search Blog Posts...")
					}
					buttonText={
						localization?.BLOG_LIST_SEARCH_BUTTON ??
						t("blog.list.searchButton", "Search Posts")
					}
					emptyMessage={
						localization?.BLOG_LIST_SEARCH_EMPTY ??
						t("blog.list.searchEmpty", "No blog posts found.")
					}
				/>
			</div>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{posts.map((post) => (
					<PostCardComponent key={post.id} post={post} />
				))}
			</div>

			{onLoadMore && hasMore && (
				<div className="flex justify-center">
					<Button
						onClick={onLoadMore}
						disabled={isLoadingMore}
						variant="outline"
						size="lg"
					>
						{isLoadingMore
							? (localization?.BLOG_LIST_LOADING_MORE ??
								t("blog.list.loadingMore", "Loading more..."))
							: (localization?.BLOG_LIST_LOAD_MORE ??
								t("blog.list.loadMore", "Load more posts"))}
					</Button>
				</div>
			)}
		</div>
	);
}
