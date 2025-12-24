// Import from adapters-build-check to ensure all adapters are verified at build time
import { createMemoryAdapter } from "./adapters-build-check"
import { betterStack } from "@btst/stack"
import { todosBackendPlugin } from "./plugins/todo/api/backend"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api"
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api"
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api"
import { openai } from "@ai-sdk/openai"
import { tool } from "ai"
import { z } from "zod"

// Import shared CMS schemas - these are used for both backend validation and client type inference
import { ProductSchema, TestimonialSchema } from "./cms-schemas"

// Tool to fetch Better Stack documentation
const betterStackDocsTool = tool({
    description: "Fetch the latest Better Stack documentation. Use this tool when the user asks about Better Stack, @btst/stack, plugins, installation, configuration, database adapters, or any development-related questions about the Better Stack framework.",
    inputSchema: z.object({
        query: z.string().describe("The user's question or topic they want to know about"),
    }),
    execute: async ({ query }) => {
        console.log("Fetching Better Stack docs for query:", query)
        try {
            const response = await fetch("https://www.better-stack.ai/docs/llms-full.txt")
            if (!response.ok) {
                return { error: `Failed to fetch docs: ${response.statusText}` }
            }
            const docs = await response.text()
            return { 
                docs,
                note: "Use this documentation to answer the user's question accurately. The docs are in markdown format."
            }
        } catch (error) {
            return { error: `Error fetching docs: ${error instanceof Error ? error.message : 'Unknown error'}` }
        }
    },
})

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
        blog: blogBackendPlugin(blogHooks),
        // AI Chat plugin with authenticated mode (default)
        // Conversations are persisted but not user-scoped (no getUserId)
        // For user-scoped conversations, add getUserId:
        //   getUserId: async (ctx) => ctx.headers?.get('x-user-id'),
        aiChat: aiChatBackendPlugin({
            model: openai("gpt-4o"),
            systemPrompt: "You are a helpful assistant that specializes in Better Stack framework. When asked about Better Stack, plugins, installation, or development topics, use the betterStackDocs tool to fetch the latest documentation. Be concise and friendly.",
            mode: "authenticated", // Default: persisted conversations
            tools: {
                betterStackDocs: betterStackDocsTool,
            },
            // Optional: Extract userId from headers to scope conversations per user
            // getUserId: async (ctx) => {
            //     const userId = ctx.headers?.get('x-user-id');
            //     if (!userId) return null; // Deny access if no user
            //     return userId;
            // },
            hooks: {
                onConversationCreated: async (conversation) => {
                    console.log("Conversation created:", conversation.id, conversation.title);
                },
                onAfterChat: async (conversationId, messages) => {
                    console.log("Chat completed in conversation:", conversationId, "Messages:", messages.length);
                },
            },
        }),
        // CMS plugin with content types defined as Zod schemas
        // Field types are now specified via .meta({ fieldType: "..." }) in the schema itself
        cms: cmsBackendPlugin({
            contentTypes: [
                { 
                    name: "Product", 
                    slug: "product", 
                    description: "Products for the store",
                    schema: ProductSchema,
                },
                { 
                    name: "Testimonial", 
                    slug: "testimonial", 
                    description: "Customer testimonials",
                    schema: TestimonialSchema,
                },
            ],
            hooks: {
                onAfterCreate: async (item, context) => {
                    console.log("CMS item created:", context.typeSlug, item.slug);
                },
                onAfterUpdate: async (item, context) => {
                    console.log("CMS item updated:", context.typeSlug, item.slug);
                },
                onAfterDelete: async (id, context) => {
                    console.log("CMS item deleted:", context.typeSlug, id);
                },
            },
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
        // Access at /api/data/reference for Scalar UI or /api/data/open-api/schema for JSON
        openApi: openApiBackendPlugin({
            title: "Better Stack Example API",
            description: "API documentation for the Next.js example application",
            theme: "kepler",
        }),
    },
    adapter: (db) => createMemoryAdapter(db)({})
})

export { handler, dbSchema }
