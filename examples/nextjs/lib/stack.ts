// Import from adapters-build-check to ensure all adapters are verified at build time
import { createMemoryAdapter } from "./adapters-build-check"
import { stack } from "@btst/stack"
import { todosBackendPlugin } from "./plugins/todo/api/backend"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api"
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api"
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api"
import { kanbanBackendPlugin } from "@btst/stack/plugins/kanban/api"
import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder"
import { openai } from "@ai-sdk/openai"
import { tool } from "ai"
import { z } from "zod"
import { revalidateTag, revalidatePath } from "next/cache"

// Import shared CMS schemas - these are used for both backend validation and client type inference
import { ProductSchema, TestimonialSchema, CategorySchema, ResourceSchema, CommentSchema, ClientProfileSchema } from "./cms-schemas"
import {
    createKanbanTask,
    findOrCreateKanbanBoard,
    getKanbanColumnsByBoardId,
} from "@btst/stack/plugins/kanban/api"

// Tool to fetch BTST documentation
const stackDocsTool = tool({
    description: "Fetch the latest BTST documentation. Use this tool when the user asks about BTST, @btst/stack, plugins, installation, configuration, database adapters, or any development-related questions about the BTST framework.",
    inputSchema: z.object({
        query: z.string().describe("The user's question or topic they want to know about"),
    }),
    execute: async ({ query }) => {
        console.log("Fetching BTST docs for query:", query)
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
// For auth examples, see /api/example-auth in stack-auth.ts
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
        // Purge the ISR cache so the next request regenerates with fresh data
        revalidatePath("/pages/ssg-blog");
        revalidatePath(`/pages/ssg-blog/${post.slug}`);
    },
    onPostUpdated: async (post) => {
        console.log("Post updated:", post.id, post.title);
        revalidatePath("/pages/ssg-blog");
        revalidatePath(`/pages/ssg-blog/${post.slug}`);
    },
    onPostDeleted: async (postId) => {
        console.log("Post deleted:", postId);
        revalidatePath("/pages/ssg-blog");
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

// Use a global singleton to share the same myStack (and in-memory adapter)
// across Next.js module boundaries (API routes vs page/SSG bundles are bundled
// separately, but all run in the same Node.js process).
const globalForStack = global as typeof global & { __btst_stack__?: ReturnType<typeof stack> };

// WealthReview Demo — AI-native financial intake tool
// Both references are set inside createStack() before any HTTP request fires.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wealthReviewAdapter: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wealthReviewCmsApi: any

const submitIntakeAssessment = tool({
    description:
        "Submit the completed client intake assessment. Call this once you have gathered sufficient information about the client's financial situation. Creates a client profile record and adds a card to the advisor review queue.",
    inputSchema: z.object({
        clientName: z.string().describe("Full name of the client"),
        age: z.number().int().min(18).describe("Client age"),
        riskTolerance: z
            .enum(["conservative", "moderate", "aggressive"])
            .describe("Assessed risk tolerance"),
        totalAssets: z
            .number()
            .min(0)
            .optional()
            .describe("Total declared assets in CAD"),
        windfallAmount: z
            .number()
            .min(0)
            .optional()
            .describe("Incoming windfall amount in CAD, if applicable"),
        lifeEvents: z
            .array(z.string())
            .describe("Upcoming or recent life events (marriage, retirement, etc.)"),
        recommendation: z
            .string()
            .describe("AI-generated recommendation for the human advisor"),
        amlFlag: z
            .boolean()
            .describe(
                "Set true if the case shows AML risk signals (large international transfers, unusual source of funds, etc.)",
            ),
        amlReason: z
            .string()
            .optional()
            .describe("Explanation of the AML flag — required when amlFlag is true"),
        confidenceScore: z
            .number()
            .min(0)
            .max(100)
            .describe("Your confidence in the recommendation (0–100)"),
    }),
    execute: async (params) => {
        if (!wealthReviewAdapter) {
            throw new Error("[WealthReview] Adapter not initialized")
        }
        const adapter = wealthReviewAdapter

        // 1. Persist client profile in CMS
        // Use api.cms.createContentItem (not the standalone mutation) so that
        // ensureSynced() runs first — required if no CMS HTTP request has been
        // made before this tool call (the content type won't exist otherwise).
        const slug = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        await wealthReviewCmsApi.createContentItem("client-profile", {
            slug,
            data: {
                ...params,
                lifeEvents: params.lifeEvents.join(", "),
            },
        })

        // 2. Ensure the advisor review board exists (idempotent)
        const board = await findOrCreateKanbanBoard(
            adapter,
            "advisor-review-queue",
            "Advisor Review Queue",
            ["New Intakes", "Under Review", "Escalated"],
        )

        // 3. Route to the correct column
        const columns = await getKanbanColumnsByBoardId(adapter, board.id)
        const targetColumn = params.amlFlag
            ? (columns.find((c: { title: string }) => c.title === "Escalated") ?? columns[columns.length - 1])
            : (columns.find((c: { title: string }) => c.title === "New Intakes") ?? columns[0])

        if (!targetColumn) {
            throw new Error("[WealthReview] No columns found on review board")
        }

        // 4. Create the Kanban review card
        await createKanbanTask(adapter, {
            title: `${params.clientName}${params.amlFlag ? " — ⚠️ ESCALATED" : " — Ready for Review"}`,
            columnId: targetColumn.id,
            priority: params.amlFlag ? "URGENT" : "MEDIUM",
            description: params.amlFlag
                ? `AML FLAG: ${params.amlReason ?? "See assessment"}\nConfidence: ${params.confidenceScore}%\n\n${params.recommendation}`
                : `Confidence: ${params.confidenceScore}%\n\n${params.recommendation}`,
        })

        return {
            success: true,
            escalated: params.amlFlag,
            message: params.amlFlag
                ? "This case has been flagged and routed to the Escalated column. A licensed compliance officer must review before proceeding."
                : "Assessment complete. Your case has been added to the advisor review queue — you'll hear back shortly.",
        }
    },
})

function createStack() {
    const s = stack({
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
            systemPrompt: "You are a helpful assistant that specializes in BTST framework. When asked about BTST, plugins, installation, or development topics, use the stackDocs tool to fetch the latest documentation. Be concise and friendly.",
            mode: "authenticated", // Default: persisted conversations
            tools: {
                stackDocs: stackDocsTool,
                submitIntakeAssessment,
            },
            // Enable route-aware page tools (fillBlogForm, updatePageLayers, etc.)
            enablePageTools: true,
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
                {
                    name: "Client Profile",
                    slug: "client-profile",
                    description: "WealthReview AI — financial intake assessments submitted by the AI advisor",
                    schema: ClientProfileSchema,
                },
                // UI Builder pages - stored as CMS content items
                UI_BUILDER_CONTENT_TYPE,
            ],
            hooks: {
                onAfterCreate: async (item, context) => {
                    console.log("CMS item created:", context.typeSlug, item.slug);
                    revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
                },
                onAfterUpdate: async (item, context) => {
                    console.log("CMS item updated:", context.typeSlug, item.slug);
                    revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
                },
                onAfterDelete: async (id, context) => {
                    console.log("CMS item deleted:", context.typeSlug, id);
                    revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
                },
            },
        }),
        // Form Builder plugin for dynamic forms
        formBuilder: formBuilderBackendPlugin({
            hooks: {
                onAfterFormCreated: async (form, context) => {
                    console.log("Form created:", form.name, form.slug);
                    revalidatePath("/pages/ssg-forms", "page");
                },
                onAfterFormUpdated: async (form, context) => {
                    console.log("Form updated:", form.name);
                    revalidatePath("/pages/ssg-forms", "page");
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
            title: "BTST Example API",
            description: "API documentation for the Next.js example application",
            theme: "kepler",
        }),
        // Kanban plugin for project management boards
        kanban: kanbanBackendPlugin({
            onBeforeListBoards: async (filter, context) => {
                console.log("onBeforeListBoards hook called", filter);
                return true;
            },
            onBeforeCreateBoard: async (data, context) => {
                console.log("onBeforeCreateBoard hook called", data.name);
                return true;
            },
            onBoardCreated: async (board, context) => {
                console.log("Board created:", board.id, board.name);
                revalidatePath("/pages/ssg-kanban", "page");
            },
        }),
    },
        adapter: (db) => createMemoryAdapter(db)({})
    })

    // Capture adapter and CMS api for the WealthReview tool's execute function.
    // Safe to assign here — execute only runs during HTTP requests, which
    // occur after module initialization is complete.
    wealthReviewAdapter = s.adapter
    wealthReviewCmsApi = s.api.cms

    return s
}

export const myStack = globalForStack.__btst_stack__ ??= createStack()

export const { handler, dbSchema } = myStack
