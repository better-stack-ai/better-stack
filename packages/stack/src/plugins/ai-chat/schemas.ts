import { z } from "zod";

export const createConversationSchema = z.object({
	id: z.string().optional(),
	title: z.string().optional(),
});

export const updateConversationSchema = z.object({
	title: z.string().optional(),
});

export const chatRequestSchema = z.object({
	messages: z.array(
		z.union([
			// Format with content string
			z.object({
				role: z.enum(["system", "user", "assistant", "data"]),
				content: z.string(),
				id: z.string().optional(),
			}),
			// Format with parts array (from UIMessage)
			z.object({
				role: z.enum(["system", "user", "assistant", "data"]),
				parts: z.array(
					z
						.object({
							type: z.string(),
							text: z.string().optional(),
							// Allow other properties that might be present
						})
						.loose(),
				),
				id: z.string().optional(),
				metadata: z.any().optional(),
			}),
		]),
	),
	conversationId: z.string().optional(),
	model: z.string().optional(),
	/**
	 * Description of the current page context, injected into the AI system prompt.
	 * Sent by ChatInterface when a page has registered context via useRegisterPageAIContext.
	 */
	pageContext: z.string().max(16000).optional(),
	/**
	 * Names of client-side tools currently available on the page.
	 * The server includes matching tool schemas in the streamText call.
	 */
	availableTools: z.array(z.string()).optional(),
});
