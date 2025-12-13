import { createMemoryAdapter } from "@btst/adapter-memory"
import { betterStack } from "@btst/stack"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { openai } from "@ai-sdk/openai"

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
        blog: blogBackendPlugin(blogHooks),
        // AI Chat plugin with authenticated mode (default)
        aiChat: aiChatBackendPlugin({
            model: openai("gpt-4o"),
            mode: "authenticated",
            hooks: {
                onConversationCreated: async (conversation) => {
                    console.log("Conversation created:", conversation.id);
                },
            },
        })
    },
    adapter: (db) => createMemoryAdapter(db)({})
})

export { handler, dbSchema }
