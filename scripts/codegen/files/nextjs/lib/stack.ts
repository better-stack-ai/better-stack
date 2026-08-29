import { createMemoryAdapter } from "./adapters-build-check";
import { createBackendStack } from "@btst/stack";
import { todosBackendPlugin } from "./plugins/todo/api/backend";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
} from "@btst/stack/plugins/blog/api";
import {
	aiChatBackendPlugin,
	AiChatOperationError,
} from "@btst/stack/plugins/ai-chat/api";
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
import { serverAuth } from "./authorization.server";

import {
	ProductSchema,
	TestimonialSchema,
	CategorySchema,
	ResourceSchema,
	CommentSchema,
	ClientProfileSchema,
} from "./cms-schemas";

if (typeof window !== "undefined") {
	throw new Error("BTST_SERVER_STACK_MODULE_MARKER: backend stack in browser");
}

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
			console.log("onBeforeListPosts: loading drafts");
		}
	},
	onAfterCreatePost: async (post) => {
		console.log("Post created:", post.id, post.title);
		revalidatePath("/pages/ssg-blog");
		revalidatePath(`/pages/ssg-blog/${post.slug}`);
	},
	onAfterUpdatePost: async (post) => {
		console.log("Post updated:", post.id, post.title);
		revalidatePath("/pages/ssg-blog");
		revalidatePath(`/pages/ssg-blog/${post.slug}`);
	},
	onAfterDeletePost: async (postId) => {
		console.log("Post deleted:", postId);
		revalidatePath("/pages/ssg-blog");
	},
	onAfterListPosts: async (posts) => {
		console.log("Posts read:", posts.length, "items");
	},
	onErrorListPosts: async (error) => {
		console.error("Failed to list posts:", error.message);
	},
	onErrorCreatePost: async (error) => {
		console.error("Failed to create post:", error.message);
	},
	onErrorUpdatePost: async (error) => {
		console.error("Failed to update post:", error.message);
	},
	onErrorDeletePost: async (error) => {
		console.error("Failed to delete post:", error.message);
	},
};

const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
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
		await myStack.trusted.cms.createContentItem({
			typeSlug: "client-profile",
			body: {
				slug,
				data: {
					...params,
					lifeEvents: params.lifeEvents.join(", "),
				},
			},
		});

		const kanban = myStack.trusted.kanban;
		const matchingBoards = await kanban.listBoards({
			slug: "advisor-review-queue",
			limit: 1,
		});
		let board = matchingBoards.items[0];
		if (!board) {
			try {
				board = await kanban.createBoard({
					name: "Advisor Review Queue",
					slug: "advisor-review-queue",
				});
			} catch (error) {
				const existing = await kanban.listBoards({
					slug: "advisor-review-queue",
					limit: 1,
				});
				board = existing.items[0];
				if (!board) throw error;
			}
		}

		const requiredColumnTitles = [
			"New Intakes",
			"Under Review",
			"Escalated",
		] as const;
		const availableColumns = [...board.columns].sort(
			(left, right) => left.order - right.order,
		);
		if (availableColumns.length < requiredColumnTitles.length) {
			throw new Error(
				"[WealthReview] Review board must retain its three default columns",
			);
		}
		const assignedColumnIds = new Set<string>();
		const assignments = requiredColumnTitles.map((title) => {
			const column =
				board.columns.find(
					(candidate) =>
						candidate.title === title && !assignedColumnIds.has(candidate.id),
				) ??
				availableColumns.find(
					(candidate) => !assignedColumnIds.has(candidate.id),
				);
			if (!column) {
				throw new Error("[WealthReview] No column available for review queue");
			}
			assignedColumnIds.add(column.id);
			return { column, title };
		});
		const columns = [];
		for (const { column, title } of assignments) {
			if (column.title === title) {
				columns.push(column);
				continue;
			}
			try {
				columns.push(
					await kanban.updateColumn({ id: column.id, data: { title } }),
				);
			} catch (error) {
				const refreshedBoards = await kanban.listBoards({
					slug: "advisor-review-queue",
					limit: 1,
				});
				const refreshedBoard = refreshedBoards.items[0];
				const reconciled = refreshedBoard?.columns.find(
					(candidate) => candidate.title === title,
				);
				if (reconciled) {
					columns.push(reconciled);
					continue;
				}
				const retryColumn = refreshedBoard?.columns.find(
					(candidate) => candidate.id === column.id,
				);
				if (!retryColumn) throw error;
				columns.push(
					await kanban.updateColumn({ id: retryColumn.id, data: { title } }),
				);
			}
		}
		const targetTitle = params.amlFlag ? "Escalated" : "New Intakes";
		const targetColumn = columns.find((column) => column.title === targetTitle);

		if (!targetColumn) {
			throw new Error("[WealthReview] No columns found on review board");
		}

		await kanban.createTask({
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
	const s = createBackendStack({
		basePath: "/api/data",
		plugins: {
			todos: todosBackendPlugin(),
			blog: blogBackendPlugin({ hooks: blogHooks }),
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
				access: "authorized",
				tools: {
					stackDocs: stackDocsTool,
					submitIntakeAssessment,
				},
				enablePageTools: true,
				hooks: {
					onAfterCreateConversation: async (conversation) => {
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
					onBeforeActivateTools: async (toolNames, routeName, context) => {
						if (context.headers?.get?.("x-btst-deny-tools") === "1") {
							throw new AiChatOperationError(
								403,
								"Tools denied by test hook",
								"TOOLS_DENIED",
							);
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
					onAfterCreateContent: async (item, context) => {
						console.log("CMS item created:", context.typeSlug, item.slug);
						revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
					},
					onAfterUpdateContent: async (item, context) => {
						console.log("CMS item updated:", context.typeSlug, item.slug);
						revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
					},
					onAfterDeleteContent: async (id, context) => {
						console.log("CMS item deleted:", context.typeSlug, id);
						revalidatePath(`/pages/ssg-cms/${context.typeSlug}`, "page");
					},
				},
			}),
			formBuilder: formBuilderBackendPlugin({
				hooks: {
					onAfterCreateForm: async (form) => {
						console.log("Form created:", form.name, form.slug);
						revalidatePath("/pages/ssg-forms", "page");
					},
					onAfterUpdateForm: async (form) => {
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
				hooks: {
					onBeforeListComments: async (query) => {
						if (query.status && query.status !== "approved") {
							console.log("onBeforeListComments: reading moderation queue");
						}
					},
					onBeforeCreateComment: async (input) => {
						console.log(
							"onBeforeCreateComment: new comment on",
							input.resourceType,
							input.resourceId,
						);
					},
					onAfterCreateComment: async (comment, ctx) => {
						console.log(
							"Comment created:",
							comment.id,
							"status:",
							comment.status,
						);
					},
					onBeforeUpdateComment: async (commentId) => {
						console.log("onBeforeUpdateComment: comment", commentId);
					},
					onBeforeToggleCommentReaction: async (commentId, authorId) => {
						console.log(
							"onBeforeToggleCommentReaction: user",
							authorId,
							"toggling like on comment",
							commentId,
						);
					},
					onBeforeModerateComment: async (commentId, status) => {
						console.log(
							"onBeforeModerateComment: comment",
							commentId,
							"->",
							status,
						);
					},
					onAfterApproveComment: async (comment, ctx) => {
						console.log("Comment approved:", comment.id);
					},
					onBeforeDeleteComment: async (commentId) => {
						console.log("onBeforeDeleteComment: comment", commentId);
					},
					onAfterDeleteComment: async (commentId, ctx) => {
						console.log("Comment deleted:", commentId);
					},
				},
			}),
			kanban: kanbanBackendPlugin({
				hooks: {
					onBeforeListBoards: async (filter) => {
						console.log("onBeforeListBoards hook called", filter);
					},
					onBeforeCreateBoard: async (data, context) => {
						console.log("onBeforeCreateBoard hook called", data.name);
					},
					onAfterCreateBoard: async (board) => {
						console.log("Board created:", board.id, board.name);
						revalidatePath("/pages/ssg-kanban", "page");
					},
				},
			}),
			media: mediaBackendPlugin({
				storageAdapter: localAdapter(),
				allowedUrlPrefixes: ["https://placehold.co"],
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: serverAuth,
	});
	if (typeof s.handler !== "function") {
		throw new Error("BTST_SERVER_STACK_MODULE_MARKER: missing API handler");
	}

	return s;
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

export const { handler, dbSchema } = myStack;
