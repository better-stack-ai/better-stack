import { createMemoryAdapter } from "./adapters-build-check";
import { stack } from "@btst/stack";
import { todosBackendPlugin } from "./plugins/todo/api/backend";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
} from "@btst/stack/plugins/blog/api";
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api";
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api";
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { kanbanBackendPlugin } from "@btst/stack/plugins/kanban/api";
import { commentsBackendPlugin } from "@btst/stack/plugins/comments/api";
import { mediaBackendPlugin } from "@btst/stack/plugins/media/api";
import { localAdapter } from "@btst/stack/plugins/media/api/adapters/local";
import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder";
import { openai } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import {
	ProductSchema,
	TestimonialSchema,
	CategorySchema,
	ResourceSchema,
	CommentSchema,
	ClientProfileSchema,
} from "./cms-schemas";
import {
	createKanbanTask,
	findOrCreateKanbanBoard,
	getKanbanColumnsByBoardId,
} from "@btst/stack/plugins/kanban/api";

const stackDocsTool = tool({
	description:
		"Fetch the latest BTST documentation. Use this tool when the user asks about BTST, @btst/stack, plugins, installation, configuration, database adapters, or any development-related questions about the BTST framework.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("The user's question or topic they want to know about"),
	}),
	execute: async ({ query }) => {
		console.log("Fetching BTST docs for query:", query);
		try {
			const response = await fetch(
				"https://www.better-stack.ai/docs/llms-full.txt",
			);
			if (!response.ok) {
				return { error: `Failed to fetch docs: ${response.statusText}` };
			}
			const docs = await response.text();
			return {
				docs,
				note: "Use this documentation to answer the user's question accurately. The docs are in markdown format.",
			};
		} catch (error) {
			return {
				error: `Error fetching docs: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	},
});

const blogHooks: BlogBackendHooks = {
	onBeforeCreatePost: async (data) => {
		console.log("onBeforeCreatePost hook called", data.title);
	},
	onBeforeUpdatePost: async (postId) => {
		console.log("onBeforeUpdatePost hook called for post:", postId);
	},
	onBeforeDeletePost: async (postId) => {
		console.log("onBeforeDeletePost hook called for post:", postId);
	},
	onBeforeListPosts: async (filter) => {
		if (filter.published === false) {
			console.log("onBeforeListPosts: checking auth for drafts");
		}
	},
	onPostCreated: async (post) => {
		console.log("Post created:", post.id, post.title);
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

const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof stack>;
};

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
		const slug = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		await myStack.api.cms.createContentItem("client-profile", {
			slug,
			data: {
				...params,
				lifeEvents: params.lifeEvents.join(", "),
			},
		});

		const board = await findOrCreateKanbanBoard(
			myStack.adapter,
			"advisor-review-queue",
			"Advisor Review Queue",
			["New Intakes", "Under Review", "Escalated"],
		);

		const columns = await getKanbanColumnsByBoardId(myStack.adapter, board.id);
		const targetColumn = params.amlFlag
			? (columns.find((c: { title: string }) => c.title === "Escalated") ??
				columns[columns.length - 1])
			: (columns.find((c: { title: string }) => c.title === "New Intakes") ??
				columns[0]);

		if (!targetColumn) {
			throw new Error("[WealthReview] No columns found on review board");
		}

		await createKanbanTask(myStack.adapter, {
			title: `${params.clientName}${params.amlFlag ? " — ⚠️ ESCALATED" : " — Ready for Review"}`,
			columnId: targetColumn.id,
			priority: params.amlFlag ? "URGENT" : "MEDIUM",
			description: params.amlFlag
				? `AML FLAG: ${params.amlReason ?? "See assessment"}\nConfidence: ${params.confidenceScore}%\n\n${params.recommendation}`
				: `Confidence: ${params.confidenceScore}%\n\n${params.recommendation}`,
		});

		return {
			success: true,
			escalated: params.amlFlag,
			message: params.amlFlag
				? "This case has been flagged and routed to the Escalated column. A licensed compliance officer must review before proceeding."
				: "Assessment complete. Your case has been added to the advisor review queue — you'll hear back shortly.",
		};
	},
});

function createStack() {
	const s = stack({
		basePath: "/api/data",
		plugins: {
			todos: todosBackendPlugin,
			blog: blogBackendPlugin(blogHooks),
			aiChat: aiChatBackendPlugin({
				model: openai("gpt-4o"),
				systemPrompt: `You are WealthReview — an AI-native financial intake assistant for a licensed investment advisory firm. Your job is to conduct a brief, natural intake conversation with clients and then submit a structured assessment for human advisor review via the submitIntakeAssessment tool.

## How to conduct intake

The submitIntakeAssessment tool has these **required** fields: clientName, age, riskTolerance, lifeEvents (array, can be empty), recommendation (your written assessment), amlFlag, confidenceScore. All other fields (totalAssets, windfallAmount, amlReason) are **optional**.

- Greet the client warmly and gather context from whatever they share.
- If the client's opening message gives you enough to fill ALL required fields above — even partially (e.g. first name only, inferred risk tolerance, empty lifeEvents array) — call submitIntakeAssessment immediately. Do NOT ask any follow-up questions first.
- Only ask a follow-up question when a genuinely critical required field cannot be reasonably inferred at all (e.g. the client gave no name, no age, and no indication of risk tolerance). Limit yourself to ONE question maximum. Never present a numbered list of questions. This is a conversation, not a form.
- Once you have enough context to fill all required fields, call submitIntakeAssessment immediately.

## AML risk detection — act immediately, do not ask follow-ups

Flag and submit immediately (amlFlag: true) when you see ALL of:
- A large sum (≥ $100,000 CAD), AND
- Any of: international source of funds, multi-country origin, rapid accumulation ("past few months"), urgency to invest quickly, vague or generic business explanation

When AML signals are present:
- Do NOT ask follow-up questions. Submit at once with amlFlag: true and a clear amlReason naming the specific signals (e.g. "Large international transfer ($200k CAD) from multiple countries over a short period, with urgency to move into equities — FINTRAC reportable activity").
- Set riskTolerance based on what the client said, or "moderate" if unclear.
- After submitting, tell the client professionally that their inquiry requires a compliance review before proceeding and they will be contacted by the appropriate team. Do not elaborate.

## After calling submitIntakeAssessment

- Routine case: confirm their profile has been added to the advisor review queue and they'll hear back shortly.
- Escalated case: confirm that a compliance review is required before proceeding and they'll be contacted.

Keep all responses concise. Do not discuss the technology stack or internal tools.`,
				mode: "authenticated",
				tools: {
					stackDocs: stackDocsTool,
					submitIntakeAssessment,
				},
				enablePageTools: true,
				hooks: {
					onConversationCreated: async (conversation) => {
						console.log(
							"Conversation created:",
							conversation.id,
							conversation.title,
						);
					},
					onAfterChat: async (conversationId, messages) => {
						console.log(
							"Chat completed in conversation:",
							conversationId,
							"Messages:",
							messages.length,
						);
					},
					onBeforeToolsActivated: async (toolNames, routeName, context) => {
						if (context.headers?.get?.("x-btst-deny-tools") === "1") {
							throw new Error("Tools denied by test hook");
						}
						return toolNames;
					},
				},
			}),
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
						description:
							"WealthReview AI — financial intake assessments submitted by the AI advisor",
						schema: ClientProfileSchema,
					},
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
			openApi: openApiBackendPlugin({
				title: "BTST Codegen API",
				description: "API documentation for the codegen Next.js project",
				theme: "kepler",
			}),
			comments: commentsBackendPlugin({
				autoApprove: false,
				resolveUser: async (authorId) => {
					return { name: `User ${authorId}` };
				},
				onBeforeList: async (query, ctx) => {
					if (query.status && query.status !== "approved") {
						console.log(
							"onBeforeList: non-approved status filter — ensure admin check in production",
						);
					}
				},
				onBeforePost: async (input, ctx) => {
					console.log(
						"onBeforePost: new comment on",
						input.resourceType,
						input.resourceId,
					);
					return { authorId: "olliethedev" };
				},
				onAfterPost: async (comment, ctx) => {
					console.log(
						"Comment created:",
						comment.id,
						"status:",
						comment.status,
					);
				},
				onBeforeEdit: async (commentId, update, ctx) => {
					console.log("onBeforeEdit: comment", commentId);
				},
				onBeforeLike: async (commentId, authorId, ctx) => {
					console.log(
						"onBeforeLike: user",
						authorId,
						"toggling like on comment",
						commentId,
					);
				},
				onBeforeStatusChange: async (commentId, status, ctx) => {
					console.log("onBeforeStatusChange: comment", commentId, "->", status);
				},
				onAfterApprove: async (comment, ctx) => {
					console.log("Comment approved:", comment.id);
				},
				onBeforeDelete: async (commentId, ctx) => {
					console.log("onBeforeDelete: comment", commentId);
				},
				onAfterDelete: async (commentId, ctx) => {
					console.log("Comment deleted:", commentId);
				},
				onBeforeListByAuthor: async (authorId, query, ctx) => {
					if (authorId !== "olliethedev") throw new Error("Forbidden");
				},
				resolveCurrentUserId: async (ctx) => {
					return ctx?.headers?.get?.("x-user-id") ?? null;
				},
			}),
			kanban: kanbanBackendPlugin({
				onBeforeListBoards: async (filter, context) => {
					console.log("onBeforeListBoards hook called", filter);
				},
				onBeforeCreateBoard: async (data, context) => {
					console.log("onBeforeCreateBoard hook called", data.name);
				},
				onBoardCreated: async (board, context) => {
					console.log("Board created:", board.id, board.name);
					revalidatePath("/pages/ssg-kanban", "page");
				},
			}),
			media: mediaBackendPlugin({
				storageAdapter: localAdapter(),
				allowedUrlPrefixes: ["https://placehold.co"],
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});

	return s;
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

export const { handler, dbSchema } = myStack;
