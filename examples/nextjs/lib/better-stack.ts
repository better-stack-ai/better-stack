// Import from adapters-build-check to ensure all adapters are verified at build time
import { createMemoryAdapter } from "./adapters-build-check"
import { betterStack } from "@btst/stack"
import { todosBackendPlugin } from "./plugins/todo/api/backend"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"

// Define blog hooks with proper types
// NOTE: This is the main API at /api/data - kept auth-free for regular tests
// For auth examples, see /api/example-auth in better-stack-auth.ts
const blogHooks: BlogBackendHooks = {
    onBeforeCreatePost: async (data) => {
        console.log("onBeforeCreatePost hook called", data.title);
        return true; // Allow for now
    },
    onBeforeUpdatePost: async (postId) => {
        // Example: Check if user owns the post or is admin
        console.log("onBeforeUpdatePost hook called for post:", postId);
        return true; // Allow for now
    },
    onBeforeDeletePost: async (postId) => {
        // Example: Check if user can delete this post
        console.log("onBeforeDeletePost hook called for post:", postId);
        return true; // Allow for now
    },
    onBeforeListPosts: async (filter) => {
        // Example: Allow public posts, require auth for drafts
        if (filter.published === false) {
            // Check authentication for drafts
            console.log("onBeforeListPosts: checking auth for drafts");
            return true;
        }
        return true; // Allow for now
    },

    // Lifecycle hooks - perform actions after operations
    onPostCreated: async (post) => {
        console.log("Post created:", post.id, post.title);
    },
    onPostUpdated: async (post) => {
        console.log("Post updated:", post.id, post.title);
    },
    onPostDeleted: async (postId) => {
        console.log("Post deleted:", postId);
    },
    onPostsRead: async (posts) => {
        console.log("Posts read:", posts.length, "items");
    },

    // Error hooks - handle operation failures
    onListPostsError: async (error) => {
        console.error("Failed to list posts:", error.message);
    },
    onCreatePostError: async (error) => {
        console.error("Failed to create post:", error.message);
    },
    onUpdatePostError: async (error) => {
        console.error("Failed to update post:", error.message);
    },
    onDeletePostError: async (error) => {
        console.error("Failed to delete post:", error.message);
    },
};

const { handler, dbSchema } = betterStack({
    basePath: "/api/data",
    plugins: {
        todos: todosBackendPlugin,
        blog: blogBackendPlugin(blogHooks)
    },
    adapter: (db) => createMemoryAdapter(db)({})
})

export { handler, dbSchema }
