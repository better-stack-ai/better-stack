import { describe, expect, it, vi } from "vitest";
import {
	createEscalateToTicketTool,
	type TicketEscalationConfig,
} from "../api/escalate-to-ticket";
import type { ChatApiContext, ChatOperationInput } from "../api/operations";

function setup(conversationId: string | undefined = "conversation-alice") {
	const request = new Request("https://example.test/api/chat");
	const context = {
		input: {
			conversationId,
			messages: [
				{
					id: "user",
					role: "user" as const,
					content: "Forged browser history",
				},
			],
		},
		request,
	} as unknown as ChatApiContext<ChatOperationInput>;
	const config: TicketEscalationConfig = {
		getConversation: vi.fn(async () => ({
			messages: [
				{
					id: "system",
					role: "system" as const,
					content: "Private system prompt",
				},
				{ id: "user", role: "user" as const, content: "My invoice is wrong" },
				{
					id: "assistant",
					role: "assistant" as const,
					content: JSON.stringify([
						{ type: "text", text: "I can help" },
						{
							type: "tool-lookup",
							toolCallId: "lookup",
							state: "output-available",
							input: {},
							output: "Private tool result",
						},
					]),
				},
				{ id: "data", role: "data" as const, content: "Private state" },
			],
		})),
		createTicket: vi.fn(async () => ({ id: "ticket-alice" })),
	};
	const execute = (input = { subject: "Invoice issue" }) =>
		createEscalateToTicketTool(config, context).execute!(input, {
			toolCallId: "call",
			messages: [],
		});
	return { context, config, execute };
}

describe("opt-in support escalation", () => {
	it("copies authorized saved conversation text and excludes system, tool and browser-injected history", async () => {
		const { context, config, execute } = setup();
		await expect(execute()).resolves.toEqual({ id: "ticket-alice" });
		expect(config.getConversation).toHaveBeenCalledWith(
			"conversation-alice",
			context,
		);
		expect(config.createTicket).toHaveBeenCalledWith(
			{
				subject: "Invoice issue",
				body: "user: My invoice is wrong\n\nassistant: I can help",
				priority: "medium",
			},
			context,
		);
	});
	it("rejects unavailable or unauthorized stored conversations before creating a ticket", async () => {
		const missing = setup();
		(missing.context.input as { conversationId?: string }).conversationId =
			undefined;
		await expect(missing.execute()).rejects.toThrow("Save the conversation");
		expect(missing.config.createTicket).not.toHaveBeenCalled();
		const denied = setup();
		vi.mocked(denied.config.getConversation).mockRejectedValue(
			new Error("Not authorized"),
		);
		await expect(denied.execute()).rejects.toThrow("Not authorized");
		expect(denied.config.createTicket).not.toHaveBeenCalled();
	});
	it("rejects oversized transcripts and invalid model input without creating a ticket", async () => {
		const { config, execute } = setup();
		vi.mocked(config.getConversation).mockResolvedValue({
			messages: [
				{ id: "user", role: "user" as const, content: "x".repeat(20001) },
			],
		});
		await expect(execute()).rejects.toThrow("1–20,000");
		await expect(execute({ subject: " " })).rejects.toThrow();
		expect(config.createTicket).not.toHaveBeenCalled();
	});
});
