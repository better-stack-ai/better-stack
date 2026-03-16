import { createMemoryAdapter } from "@btst/adapter-memory"
import { stack } from "@btst/stack"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api"
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api"
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api"
import { kanbanBackendPlugin } from "@btst/stack/plugins/kanban/api"
import { commentsBackendPlugin } from "@btst/stack/plugins/comments/api"
import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder"
import { openai } from "@ai-sdk/openai"

// Import shared CMS schemas - these are used for both backend validation and client type inference
import { ProductSchema, TestimonialSchema, CategorySchema, ResourceSchema, CommentSchema } from "./cms-schemas"

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

const { handler, dbSchema } = stack({
    basePath: "/api/data",
    plugins: {
        blog: blogBackendPlugin(blogHooks),
        // AI Chat plugin with authenticated mode (default)
        aiChat: aiChatBackendPlugin({
            model: openai("gpt-4o"),
            mode: "authenticated",
            enablePageTools: true,
            hooks: {
                onConversationCreated: async (conversation) => {
                    console.log("Conversation created:", conversation.id);
                },
                onBeforeToolsActivated: async (toolNames, _routeName, context) => {
                    if (context.headers?.get?.("x-btst-deny-tools") === "1") {
                        throw new Error("Tools denied by test hook");
                    }
                    return toolNames;
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
            title: "BTST TanStack API",
            theme: "kepler",
        }),
        // Kanban plugin for project management boards
        kanban: kanbanBackendPlugin({
            onBeforeListBoards: async (filter, context) => {
                console.log("onBeforeListBoards hook called", filter);
                return true;
            },
            onBoardCreated: async (board, context) => {
                console.log("Board created:", board.id, board.name);
            },
        }),
        // Comments plugin for threaded discussions
        comments: commentsBackendPlugin({
            autoApprove: false,
            resolveUser: async (authorId) => {
                // In production: look up your auth system's user by authorId
                return { name: `User ${authorId}` }
            },
            onBeforeList: async (query, ctx) => {
                // Restrict pending/spam queues to admin sessions.
                // Without this check a no-op hook would bypass the built-in 403 guard.
                if (query.status && query.status !== "approved") {
                    // In production: replace with a real session/role check, e.g.:
                    // const session = await getSession(ctx.headers)
                    // if (!session?.user?.isAdmin) throw new Error("Admin access required")
                    console.log("onBeforeList: non-approved status filter — ensure admin check in production")
                }
            },
            onBeforePost: async (input, ctx) => {
                // In production: verify the session and return the authenticated user's ID
                console.log("onBeforePost: new comment on", input.resourceType, input.resourceId)
                return { authorId: "olliethedev" } // In production: return { authorId: session.user.id }
            },
            onBeforeLike: async (commentId, authorId, ctx) => {
                // In production: verify authorId matches the authenticated session
                console.log("onBeforeLike: user", authorId, "toggling like on comment", commentId)
            },
            onBeforeStatusChange: async (commentId, status, ctx) => {
                // In production: verify the caller has admin/moderator role
                console.log("onBeforeStatusChange: comment", commentId, "->", status)
            },
            onBeforeDelete: async (commentId, ctx) => {
                // In production: verify the caller has admin/moderator role
                console.log("onBeforeDelete: comment", commentId)
            },
            onBeforeListByAuthor: async (authorId, query, ctx) => {
                // In production: verify authorId matches the authenticated session
                // const session = await getSession(ctx.headers)
                // if (!session?.user) throw new Error("Authentication required")
                // if (authorId !== session.user.id && !session.user.isAdmin) throw new Error("Forbidden")
                if (authorId !== "olliethedev") throw new Error("Forbidden")
            },
            resolveCurrentUserId: async (ctx) => {
                // In production: return session?.user?.id ?? null
                // Demo only: read from x-user-id header so E2E tests can simulate
                // authenticated vs unauthenticated requests independently.
                return ctx.headers.get?.("x-user-id") ?? null
            },
        }),
    },
    adapter: (db) => createMemoryAdapter(db)({})
})

export { handler, dbSchema }
