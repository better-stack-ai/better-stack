"use client";
import { HomePageComponent as PostListPageImpl } from "./pages/home-page";
import { NewPostPageComponent as NewPostPageImpl } from "./pages/new-post-page";
import { PostPageComponent as PostPageImpl } from "./pages/post-page";
import { EditPostPageComponent as EditPostPageImpl } from "./pages/edit-post-page";
import { PostCard as PostCardImpl } from "./shared/post-card";
import { PostsList as PostsListImpl } from "./shared/posts-list";
import { EmptyList as EmptyListImpl } from "./shared/empty-list";
import { RecentPostsCarousel as RecentPostsCarouselImpl } from "./shared/recent-posts-carousel";
import { PostNavigation as PostNavigationImpl } from "./shared/post-navigation";
import { TagsList as TagsListImpl } from "./shared/tags-list";
import { PostCardSkeleton as PostCardSkeletonImpl } from "./loading/post-card-skeleton";

// Re-export to ensure the client boundary is preserved
export const PostListPage = PostListPageImpl;
export const NewPostPage = NewPostPageImpl;
export const PostPage = PostPageImpl;
export const EditPostPage = EditPostPageImpl;

/**
 * Card component that renders a single blog post summary
 * (cover image, title, date, tags). Used by the built-in posts list and
 * available for composing custom blog landing pages.
 *
 * Requires a `StackProvider` with the blog plugin registered so that
 * `Link` and `Image` overrides are resolved correctly.
 */
export const PostCard = PostCardImpl;

/**
 * Skeleton placeholder that mirrors the layout of {@link PostCard}.
 * Use inside a `<Suspense>` fallback or while data is loading.
 */
export const PostCardSkeleton = PostCardSkeletonImpl;

/**
 * Grid of {@link PostCard}s with optional load-more pagination and a
 * built-in search input. Pass an array of `SerializedPost`s.
 */
export const PostsList = PostsListImpl;

/**
 * Empty-state placeholder used by the built-in blog list pages.
 * Renders a centered icon and a customisable message.
 */
export const EmptyList = EmptyListImpl;

/**
 * Horizontal carousel of recent posts. Drop-in component for "you might
 * also like" sections on a blog post page.
 */
export const RecentPostsCarousel = RecentPostsCarouselImpl;

/**
 * Previous/next post navigation strip, typically rendered at the bottom
 * of a post page.
 */
export const PostNavigation = PostNavigationImpl;

/**
 * Renders a list of tags for a post or for the whole blog.
 */
export const TagsList = TagsListImpl;
