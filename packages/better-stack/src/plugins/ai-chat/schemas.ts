import { z } from "zod";

export const createConversationSchema = z.object({
	id: z.string().optional(),
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
});
