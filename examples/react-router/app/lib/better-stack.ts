import { createMemoryAdapter } from "@btst/adapter-memory"
import { betterStack } from "@btst/stack"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api"
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api"
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api"
import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder"
import { openai } from "@ai-sdk/openai"

// Import shared CMS schemas - these are used for both backend validation and client type inference
import { ProductSchema, TestimonialSchema, CategorySchema, ResourceSchema, CommentSchema } from "./cms-schemas"

// Define blog hooks with proper types
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
        }),
        // CMS plugin with content types
        // Field types are now specified via .meta({ fieldType: "..." }) in the schema itself
        cms: cmsBackendPlugin({
            contentTypes: [
                { 
                    name: "Product", 
                    slug: "product", 
                    schema: ProductSchema,
                },
                { 
                    name: "Testimonial", 
                    slug: "testimonial", 
                    schema: TestimonialSchema,
                },
                { 
                    name: "Category", 
                    slug: "category", 
                    description: "Categories for organizing resources",
                    schema: CategorySchema,
                },
                { 
                    name: "Resource", 
                    slug: "resource", 
                    description: "Directory of resources with category relationships",
                    schema: ResourceSchema,
                },
                { 
                    name: "Comment", 
                    slug: "comment", 
                    description: "Comments on resources (one-to-many relationship)",
                    schema: CommentSchema,
                },
                // UI Builder pages
                UI_BUILDER_CONTENT_TYPE,
            ],
        }),
        // Form Builder plugin for dynamic forms
        formBuilder: formBuilderBackendPlugin({
            hooks: {
                onAfterFormCreated: async (form, context) => {
                    console.log("Form created:", form.name, form.slug);
                },
                onAfterFormUpdated: async (form, context) => {
                    console.log("Form updated:", form.name);
                },
                onAfterSubmission: async (submission, form, context) => {
                    console.log("Form submission received:", form.name, submission.id);
                    console.log("Submission data:", JSON.parse(submission.data));
                    console.log("IP Address:", context.ipAddress);
                },
            },
        }),
        // OpenAPI plugin - generates API documentation for all plugins
        openApi: openApiBackendPlugin({
            title: "Better Stack React Router API",
            theme: "kepler",
        }),
    },
    adapter: (db) => createMemoryAdapter(db)({})
})

export { handler, dbSchema }
