import api = require("@btst/plugin-blog/api");
import client = require("@btst/plugin-blog/client");
import hooks = require("@btst/plugin-blog/client/hooks");
import components = require("@btst/plugin-blog/client/components");
import posts = require("@btst/plugin-blog/client/pages/posts");
import post = require("@btst/plugin-blog/client/pages/post");
import tag = require("@btst/plugin-blog/client/pages/tag");
import permissions = require("@btst/plugin-blog/permissions");
import queries = require("@btst/plugin-blog/query-keys");
import types = require("@btst/plugin-blog/types");
export type PublicBlog = [
	typeof api.blogBackendPlugin,
	typeof client.blogClientPlugin,
	typeof hooks.usePosts,
	typeof components.NewPostPage,
	typeof posts.PostListPage,
	typeof post.PostPage,
	typeof tag.TagPage,
	typeof permissions.blogPermissions,
	typeof queries.createBlogQueryKeys,
	types.SerializedPost,
];
// @ts-expect-error Canonical identity remains blog.
client.blogClientPlugin().id satisfies "articles";
