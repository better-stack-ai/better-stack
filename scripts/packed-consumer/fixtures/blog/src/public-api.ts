import { blogBackendPlugin } from "@btst/plugin-blog/api";
import {
	blogClientPlugin,
	type BlogPluginOverrides,
} from "@btst/plugin-blog/client";
import { NewPostPage } from "@btst/plugin-blog/client/components";
import { PostListPage } from "@btst/plugin-blog/client/pages/posts";
import { PostPage } from "@btst/plugin-blog/client/pages/post";
import { TagPage } from "@btst/plugin-blog/client/pages/tag";
import { usePosts } from "@btst/plugin-blog/client/hooks";
import { createBlogQueryKeys } from "@btst/plugin-blog/query-keys";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import type { SerializedPost } from "@btst/plugin-blog/types";
export type PublicBlog = [
	typeof blogBackendPlugin,
	typeof blogClientPlugin,
	BlogPluginOverrides,
	typeof NewPostPage,
	typeof PostListPage,
	typeof PostPage,
	typeof TagPage,
	typeof usePosts,
	typeof createBlogQueryKeys,
	typeof blogPermissions,
	SerializedPost,
];
blogClientPlugin().id satisfies "blog";
// @ts-expect-error Plugin identity remains canonical.
blogClientPlugin().id satisfies "articles";
// @ts-expect-error Newsletter options do not belong to Blog.
blogClientPlugin({ newsletter: true });
