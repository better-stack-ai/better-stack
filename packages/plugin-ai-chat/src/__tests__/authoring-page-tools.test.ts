import { createMemoryAdapter } from "@btst/adapter-memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createBackendStack } from "@btst/stack/api";
import { aiChatBackendPlugin } from "../api";

const tools = [
	["draftTicketReply", "helpdesk-inbox-ticket"],
	["updateFormSchema", "form-builder-editor"],
	["fillCampaignForm", "newsletter-campaign-editor"],
	["fillCmsEntryForm", "cms-content-editor"],
	["createKanbanTasks", "kanban-board"],
	["draftSchoolLesson", "school-lesson-editor"],
] as const;

describe("authoring tool route enforcement at the stream boundary", () => {
	it.each(tools)(
		"activates only %s on its registered route",
		async (name, routeName) => {
			for (const requestedRoute of [routeName, "public-unrelated-page"]) {
				const model = new MockLanguageModelV4({
					doStream: {
						stream: simulateReadableStream({
							chunks: [
								{ type: "text-start", id: "a" },
								{ type: "text-delta", id: "a", delta: "Draft ready" },
								{ type: "text-end", id: "a" },
								{
									type: "finish",
									finishReason: { unified: "stop", raw: undefined },
									usage: {
										inputTokens: {
											total: 1,
											noCache: 1,
											cacheRead: undefined,
											cacheWrite: undefined,
										},
										outputTokens: { total: 1, text: 1, reasoning: undefined },
									},
								},
							],
						}),
					},
				});
				const app = createBackendStack({
					basePath: "/api",
					adapter: (db) => createMemoryAdapter(db)({}),
					plugins: {
						aiChat: aiChatBackendPlugin({
							model,
							access: "public",
							enablePageTools: true,
							hooks: { onBeforeActivateTools: (names) => names },
						}),
					},
				});
				const response = await app.handler(
					new Request("http://localhost/api/chat", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							messages: [
								{
									role: "user",
									parts: [{ type: "text", text: "Help me draft" }],
								},
							],
							availableTools: tools.map(([tool]) => tool),
							routeName: requestedRoute,
						}),
					}),
				);
				expect(response.status).toBe(200);
				await response.text();
				expect(
					model.doStreamCalls[0]?.tools?.map((tool) => tool.name) ?? [],
				).toEqual(requestedRoute === routeName ? [name] : []);
			}
		},
	);
});
