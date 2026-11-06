import { tool, type Tool } from "ai";
import { z } from "zod";
import { persistedHistory } from "../history";
import type { SerializedMessage } from "../types";
import type { ChatApiContext, ChatOperationInput } from "./operations";

/** Persisted conversation text loaded through the caller's authorized API. */
export type TicketEscalationConversation = {
	messages: readonly Pick<SerializedMessage, "id" | "role" | "content">[];
};
/** Opt-in Helpdesk integration; callbacks retain ownership and ticket authorization. */
export interface TicketEscalationConfig {
	/** Load stored history with request-scoped conversation read authorization. */
	getConversation: (
		id: string,
		context: ChatApiContext<ChatOperationInput>,
	) => Promise<TicketEscalationConversation>;
	/** Create a ticket with request-scoped customer-ticket authorization. */
	createTicket: (
		input: {
			subject: string;
			body: string;
			priority: "low" | "medium" | "high" | "urgent";
		},
		context: ChatApiContext<ChatOperationInput>,
	) => Promise<{ id: string }>;
}
const escalationInput = z.object({
	subject: z.string().trim().min(1).max(250),
	priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});
/** Build a per-request server tool without importing or requiring Helpdesk. */
export function createEscalateToTicketTool(
	config: TicketEscalationConfig,
	context: ChatApiContext<ChatOperationInput>,
): Tool<z.output<typeof escalationInput>, { id: string }> {
	return tool({
		description:
			"Convert this saved conversation to a support ticket only when the user explicitly asks to escalate to support. The transcript is loaded from authorized saved history; no system instructions or tool outputs are copied.",
		inputSchema: escalationInput,
		execute: async (input) => {
			const { subject, priority } = escalationInput.parse(input);
			const id = context.input.conversationId;
			if (!id)
				throw new Error("Save the conversation before escalating to support.");
			const conversation = await config.getConversation(id, context);
			const body = persistedHistory(conversation.messages)
				.flatMap((message) => {
					if (message.role !== "user" && message.role !== "assistant")
						return [];
					const content = message.parts
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n");
					return content.trim() ? [`${message.role}: ${content}`] : [];
				})
				.join("\n\n");
			if (!body || body.length > 20000)
				throw new Error(
					"The saved conversation must contain 1–20,000 characters of text to escalate.",
				);
			return config.createTicket({ subject, body, priority }, context);
		},
	});
}
