import { describe, expect, it, vi } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { MockLanguageModelV4 } from "ai/test";
import {
	simulateReadableStream,
	tool,
	type ModelMessage,
	type UIMessage,
} from "ai";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { aiChatBackendPlugin } from "../api";
import {
	chatResponse,
	compactConversation,
	createStepCompactor,
	createSummarizer,
	estimateContextTokens,
} from "../api/compaction";
import {
	captureContextCheckpoint,
	contextRequest,
} from "../client/context-checkpoint";

const message = (
	id: string,
	role: "user" | "assistant",
	text: string,
): UIMessage => ({ id, role, parts: [{ type: "text", text }] });
const history = [
	message("u1", "user", "Remember my goal. " + "research ".repeat(2000)),
	message("a1", "assistant", "https://example.org/source; evidence uncertain"),
	message("u2", "user", "Compare the alternatives"),
	message("a2", "assistant", "A comparison"),
	message("u3", "user", "What was the uncertainty?"),
];

describe("public context compaction", () => {
	it("uses size rather than message count and leaves the transcript untouched", async () => {
		const summarize = vi
			.fn()
			.mockResolvedValue("Goal, sources, and uncertainty");
		const original = structuredClone(history);
		const result = await compactConversation({
			messages: history,
			budget: 3200,
			overhead: "rules",
			summarize,
		});
		expect(result.throughMessageId).toBe("a1");
		expect(result.messages.map((m) => m.id)).toEqual(["u2", "a2", "u3"]);
		expect(summarize.mock.calls[0]?.[0].messages).toEqual(history.slice(0, 2));
		expect(history).toEqual(original);
		const short = Array.from({ length: 100 }, (_, i) =>
			message(String(i), i % 2 ? "assistant" : "user", "Hi"),
		);
		await compactConversation({
			messages: short,
			budget: 10000,
			overhead: "",
			summarize,
		});
		expect(summarize).toHaveBeenCalledOnce();
	});

	it("counts image content separately from inline bytes and keeps tool output as text", () => {
		const inline = {
			role: "user",
			parts: [
				{
					type: "file",
					mediaType: "image/png",
					url: "data:image/png;base64," + "A".repeat(100_000),
				},
			],
		};
		const remote = {
			role: "user",
			parts: [
				{
					type: "file",
					mediaType: "image/png",
					url: "https://example.org/image.png",
				},
			],
		};
		expect(estimateContextTokens([inline])).toBe(
			estimateContextTokens([remote]),
		);
		expect(estimateContextTokens([inline])).toBeGreaterThanOrEqual(4096);
		const toolOutput = {
			role: "tool",
			content: [
				{ type: "tool-result", output: { type: "json", value: inline } },
			],
		};
		expect(estimateContextTokens([toolOutput])).toBeGreaterThan(30_000);
	});

	it("sends older images as vision input when summarizing instead of serialized bytes", async () => {
		const png =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr1sAAAAASUVORK5CYII=";
		const original = [
			message("u1", "user", "Remember the number in this image"),
		];
		original[0]!.parts.push({ type: "file", mediaType: "image/png", url: png });
		const model = new MockLanguageModelV4({
			doGenerate: async ({ prompt }) => ({
				content: [
					{
						type: "text",
						text: JSON.stringify(prompt).includes('"type":"file"')
							? "The image shows verification number 917."
							: "The user wants to remember the image number.",
					},
				],
				finishReason: { unified: "stop" as const, raw: undefined },
				usage: {
					inputTokens: {
						total: 100,
						noCache: 100,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: { total: 20, text: 20, reasoning: undefined },
				},
				warnings: [],
			}),
		});
		const before = structuredClone(original);
		const summary = await createSummarizer(
			model,
			16_384,
		)({ messages: original });
		expect(summary).toContain("917");
		expect(
			model.doGenerateCalls.some((call) =>
				call.prompt.some(
					(message) =>
						message.role === "user" &&
						message.content.some(
							(part) => part.type === "file" && part.mediaType === "image/png",
						),
				),
			),
		).toBe(true);
		expect(JSON.stringify(model.doGenerateCalls)).not.toContain(
			"data:image/png;base64",
		);
		expect(original).toEqual(before);
	});

	it("reuses a checkpoint only while all summarized messages are unchanged", () => {
		const checkpoint = captureContextCheckpoint(history, "summary", "a1");
		expect(contextRequest(history, checkpoint)).toEqual({
			messages: history.slice(2),
			contextSummary: "summary",
		});
		const edited = [
			message("u1", "user", "Different goal"),
			...history.slice(1),
		];
		expect(contextRequest(edited, checkpoint)).toEqual({ messages: edited });
		expect(contextRequest(history.slice(0, 1), checkpoint)).toEqual({
			messages: history.slice(0, 1),
		});
		expect(contextRequest([], checkpoint)).toEqual({ messages: [] });
	});

	it("retains tool pairs, recent questions, and system instructions between steps", async () => {
		const messages: ModelMessage[] = [
			{ role: "system", content: "Keep original instructions" },
			{ role: "user", content: "Read this profile" },
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolName: "readPage",
						toolCallId: "read-1",
						input: { path: "/one" },
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolName: "readPage",
						toolCallId: "read-1",
						output: { type: "text", value: "evidence ".repeat(10000) },
					},
				],
			},
		];
		const summarize = vi
			.fn()
			.mockResolvedValue(
				"Source /one; preclinical evidence; uncertainty remains.",
			);
		const status = vi.fn();
		const prepare = createStepCompactor({
			budget: 3000,
			overhead: "",
			summarize,
			onCompacting: status,
		});
		const result = await prepare({ messages });
		expect(result.messages[0]).toEqual(messages[0]);
		expect(result.messages[1]).toEqual(messages[1]);
		expect(result.messages[2]).toEqual(messages[2]);
		expect(JSON.stringify(result.messages[3])).toContain(
			'"toolCallId":"read-1"',
		);
		expect(JSON.stringify(result.messages[3])).toContain(
			"preclinical evidence",
		);
		expect(estimateContextTokens(result.messages)).toBeLessThan(3000);
		await prepare({
			messages: [...messages, { role: "assistant", content: "Answer" }],
		});
		expect(summarize).toHaveBeenCalledOnce();
		expect(status.mock.calls).toEqual([[true], [false]]);
	});

	it("retains the current question and tool results after SDK 7 carries compacted history forward", async () => {
		const finish = {
			type: "finish" as const,
			finishReason: { unified: "stop" as const, raw: undefined },
			usage: {
				inputTokens: {
					total: 100,
					noCache: 100,
					cacheRead: undefined,
					cacheWrite: undefined,
				},
				outputTokens: { total: 20, text: 20, reasoning: undefined },
			},
		};
		let calls = 0;
		const model = new MockLanguageModelV4({
			doGenerate: {
				content: [
					{ type: "text", text: "Earlier reference: FIRST_SOURCE_917" },
				],
				finishReason: finish.finishReason,
				usage: finish.usage,
				warnings: [],
			},
			doStream: async () => {
				const step = ++calls;
				return {
					stream: simulateReadableStream({
						chunks: [
							...(step < 3
								? [
										{
											type: "tool-call" as const,
											toolCallId: `read-${step}`,
											toolName: "lookup",
											input: JSON.stringify({ step }),
										},
										{
											...finish,
											finishReason: {
												unified: "tool-calls" as const,
												raw: undefined,
											},
										},
									]
								: [
										{ type: "text-start" as const, id: "answer" },
										{
											type: "text-delta" as const,
											id: "answer",
											delta: "Answer using both sources",
										},
										{ type: "text-end" as const, id: "answer" },
										finish,
									]),
						],
						initialDelayInMs: null,
						chunkDelayInMs: null,
					}),
				};
			},
		});
		const messages = Array.from({ length: 3 }, (_, index) => [
			message(`old-user-${index}`, "user", `Old topic ${index}`),
			message(`old-assistant-${index}`, "assistant", `Old answer ${index}`),
		]).flat();
		messages.push(
			message("recent", "user", "Keep this recent context"),
			message("ack", "assistant", "Acknowledged"),
			message("current", "user", "CURRENT QUESTION: compare both sources"),
		);
		const onError = vi.fn();
		const response = chatResponse({
			model,
			messages,
			system: "Original rules",
			config: { contextWindowTokens: 4096 },
			tools: {
				lookup: tool({
					inputSchema: z.object({ step: z.number() }),
					execute: async ({ step }) =>
						step === 1 ? "FIRST_SOURCE_917 ".repeat(2000) : "SECOND_SOURCE_823",
				}),
			},
			onError,
		});
		expect(await response.text()).toContain("Answer using both sources");
		expect(onError).not.toHaveBeenCalled();
		expect(model.doStreamCalls).toHaveLength(3);
		expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
			"Old topic 0",
		);
		expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).not.toContain(
			"Old topic 0",
		);
		const finalPrompt = JSON.stringify(model.doStreamCalls[2]?.prompt);
		for (const expected of [
			"Original rules",
			"CURRENT QUESTION",
			"read-1",
			"FIRST_SOURCE_917",
			"read-2",
			"SECOND_SOURCE_823",
		]) {
			expect(finalPrompt).toContain(expected);
		}
	});

	it("preserves denied approvals while compacting tool results", async () => {
		const approval = {
			type: "tool-approval-response" as const,
			approvalId: "approval-1",
			approved: false,
			reason: "Not approved",
		};
		const prepare = createStepCompactor({
			budget: 1000,
			overhead: "",
			summarize: async () => "Short reference summary",
			onCompacting: () => {},
		});
		const result = await prepare({
			messages: [
				{ role: "user", content: "Read the evidence" },
				{
					role: "tool",
					content: [
						approval,
						{
							type: "tool-result",
							toolName: "readPage",
							toolCallId: "read-1",
							output: { type: "text", value: "evidence ".repeat(10000) },
						},
					],
				},
			],
		});
		expect(result.messages[1]).toMatchObject({
			role: "tool",
			content: [
				approval,
				{
					type: "tool-result",
					output: {
						type: "text",
						value: expect.stringContaining("Short reference summary"),
					},
				},
			],
		});
	});

	it("does not discard context when summarization fails", async () => {
		const original = structuredClone(history);
		await expect(
			compactConversation({
				messages: history,
				budget: 3000,
				overhead: "",
				summarize: async () => {
					throw new Error("provider unavailable");
				},
			}),
		).rejects.toThrow("provider unavailable");
		expect(history).toEqual(original);
	});

	it("chunks oversized Unicode histories and includes earlier summaries", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: async () => ({
				content: [{ type: "text", text: "Retained facts" }],
				finishReason: { unified: "stop" as const, raw: undefined },
				usage: {
					inputTokens: {
						total: 100,
						noCache: 100,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: { total: 10, text: 10, reasoning: undefined },
				},
				warnings: [],
			}),
		});
		await createSummarizer(model, 4096)({ text: "研究".repeat(4000) });
		expect(model.doGenerateCalls.length).toBeGreaterThan(1);
		for (const call of model.doGenerateCalls)
			expect(estimateContextTokens(call.prompt)).toBeLessThan(4096);
		expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain(
			"Retained facts",
		);
	});

	it("streams status/checkpoints and continues with a compact model prompt", async () => {
		const model = new MockLanguageModelV4({
			doGenerate: async () => ({
				content: [
					{
						type: "text",
						text: "Earlier goal and uncertain evidence: https://example.org/source",
					},
				],
				finishReason: { unified: "stop" as const, raw: undefined },
				usage: {
					inputTokens: {
						total: 100,
						noCache: 100,
						cacheRead: undefined,
						cacheWrite: undefined,
					},
					outputTokens: { total: 20, text: 20, reasoning: undefined },
				},
				warnings: [],
			}),
			doStream: async () => ({
				stream: simulateReadableStream({
					chunks: [
						{ type: "text-start" as const, id: "t" },
						{
							type: "text-delta" as const,
							id: "t",
							delta: "Continuing the conversation.",
						},
						{ type: "text-end" as const, id: "t" },
						{
							type: "finish" as const,
							finishReason: { unified: "stop" as const, raw: undefined },
							usage: {
								inputTokens: {
									total: 100,
									noCache: 100,
									cacheRead: undefined,
									cacheWrite: undefined,
								},
								outputTokens: { total: 20, text: 20, reasoning: undefined },
							},
						},
					],
					initialDelayInMs: null,
					chunkDelayInMs: null,
				}),
			}),
		});
		const before = vi.fn();
		const app = createBackendStack({
			basePath: "/api",
			plugins: {
				aiChat: aiChatBackendPlugin({
					model,
					access: "public",
					systemPrompt: "Original rules",
					compaction: { contextWindowTokens: 4096 },
					hooks: { onBeforeChat: before },
				}),
			},
			adapter: (db) => createMemoryAdapter(db)({}),
		});
		const send = (body: unknown) =>
			app.handler(
				new Request("http://localhost/api/chat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				}),
			);
		const response = await send({ messages: history });
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('"data-context-status"');
		expect(text).toContain('"throughMessageId":"a1"');
		expect(text).toContain("Continuing the conversation.");
		expect(before).toHaveBeenCalledOnce();
		expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain(
			"Original rules",
		);
		expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).not.toContain(
			"research ".repeat(100),
		);
		const checkpointLine = text
			.split("\n")
			.find((line) => line.includes('"data-context-checkpoint"'))!;
		const checkpoint = JSON.parse(checkpointLine.slice(6)).data;
		const next = await send({
			messages: history.slice(2),
			contextSummary: checkpoint.summary,
		});
		await next.text();
		expect(JSON.stringify(model.doStreamCalls.at(-1)?.prompt)).toContain(
			"Earlier goal",
		);
		const oversized = await send({
			messages: [message("large", "user", "research ".repeat(4000))],
		});
		expect(await oversized.text()).toContain("Shorten it and retry");
		expect(model.doStreamCalls).toHaveLength(2);
	});
});
