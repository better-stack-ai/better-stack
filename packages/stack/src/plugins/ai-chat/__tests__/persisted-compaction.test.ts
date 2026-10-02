import { describe, expect, it, vi } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { MockLanguageModelV2 } from "ai/test";
import {
	lastAssistantMessageIsCompleteWithToolCalls,
	simulateReadableStream,
	tool,
	type UIMessage,
} from "ai";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { aiChatBackendPlugin } from "../api";
import { aiChatPermissions } from "../permissions";
import { persistedHistory } from "../history";
import type { AiChatBackendConfig } from "../api/plugin";
import type { Conversation, Message } from "../types";

const text = (
	id: string,
	role: "user" | "assistant",
	value: string,
): UIMessage => ({
	id,
	role,
	parts: [{ type: "text", text: value }],
});

function model() {
	return new MockLanguageModelV2({
		doGenerate: async () => ({
			content: [
				{ type: "text", text: "The user's verification code is ORCHID-917." },
			],
			finishReason: "stop",
			usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
			warnings: [],
		}),
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "text-start" as const, id: "answer" },
					{ type: "text-delta" as const, id: "answer", delta: "ORCHID-917" },
					{ type: "text-end" as const, id: "answer" },
					{
						type: "finish" as const,
						finishReason: "stop" as const,
						usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
					},
				],
				initialDelayInMs: null,
				chunkDelayInMs: null,
			}),
		}),
	});
}

function backend(
	languageModel = model(),
	config: Partial<AiChatBackendConfig> = {},
) {
	const after = vi.fn();
	const errors = vi.fn();
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [aiChatPermissions] as const,
		rules: ({ aiChat }) => {
			const owns = ({
				identity,
				facts,
			}: {
				identity: { id: string } | null;
				facts: { ownerId?: string };
			}) =>
				Boolean(identity && (!facts.ownerId || facts.ownerId === identity.id));
			return [
				aiChat.stream.start.when(owns),
				aiChat.message.send.when(owns),
				aiChat.message.retry.when(owns),
				aiChat.message.edit.when(owns),
				aiChat.tool.activate.when(owns),
				aiChat.conversation.create.when(({ identity }) => identity !== null),
				aiChat.conversation.read.when(({ identity, facts }) =>
					facts.scope === "collection"
						? identity !== null
						: owns({ identity, facts }),
				),
			];
		},
	});
	const app = createBackendStack({
		basePath: "/api",
		plugins: {
			aiChat: aiChatBackendPlugin({
				model: languageModel,
				compaction: { contextWindowTokens: 4096 },
				...config,
				hooks: { onAfterChat: after, onErrorChat: errors, ...config.hooks },
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => ({
				id: request.headers.get("x-user-id") ?? "owner",
			}),
		}),
	});
	return { app, languageModel, after, errors };
}

async function resume(
	app: ReturnType<typeof backend>["app"],
	id: string,
): Promise<UIMessage[]> {
	const saved = await app.trusted.aiChat.getConversation({ id });
	return saved.messages.map((message) => ({
		id: message.id,
		role: message.role as UIMessage["role"],
		parts: JSON.parse(message.content),
	}));
}

const finish = {
	type: "finish" as const,
	finishReason: "stop" as const,
	usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
};

async function seed(app: ReturnType<typeof backend>["app"]) {
	const now = new Date("2026-01-01T00:00:00Z");
	const conversation = await app.adapter.create<Conversation>({
		model: "conversation",
		data: {
			userId: "owner",
			title: "Long chat",
			createdAt: now,
			updatedAt: now,
		},
	});
	const messages = [
		text("u1", "user", "My code is ORCHID-917. " + "research ".repeat(1800)),
		text("a1", "assistant", "I will remember your code."),
		text("u2", "user", "Keep going"),
		text("a2", "assistant", "Ready."),
	];
	for (const [index, message] of messages.entries()) {
		await app.adapter.create<Message>({
			model: "message",
			forceAllowId: true,
			data: {
				id: message.id,
				conversationId: conversation.id,
				role: message.role,
				content: JSON.stringify(message.parts),
				createdAt: new Date(now.getTime() + index),
			} as Message,
		});
	}
	return { conversation, messages };
}

describe("persisted context compaction", () => {
	it("persists successful responses without content and calls the completion hook", async () => {
		const languageModel = model();
		languageModel.doStream = async () => ({
			stream: simulateReadableStream({
				chunks: [finish],
				initialDelayInMs: null,
				chunkDelayInMs: null,
			}),
		});
		const { app, after, errors } = backend(languageModel);
		const response = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			messages: [text("u1", "user", "Please stay silent")],
		});
		await response.text();
		const saved = await app.trusted.aiChat.getConversation({
			id: response.headers.get("X-Conversation-Id")!,
		});
		expect(saved.messages).toHaveLength(2);
		expect(saved.messages[1]).toMatchObject({
			role: "assistant",
			content: JSON.stringify([{ type: "step-start" }]),
		});
		expect(saved.messages[1]?.interrupted).not.toBe(true);
		expect(persistedHistory(saved.messages)[1]).toEqual({
			id: saved.messages[1]!.id,
			role: "assistant",
			parts: [{ type: "step-start" }],
		});
		expect(after).toHaveBeenCalledOnce();
		expect(after.mock.calls[0]?.[1]).toEqual(saved.messages);
		expect(errors).not.toHaveBeenCalled();
	});

	it("preserves the transcript and reuses a server-owned checkpoint after resume", async () => {
		const { app, languageModel, after } = backend();
		const { conversation, messages } = await seed(app);
		const response = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			conversationId: conversation.id,
			messages: [...messages, text("u3", "user", "What is my code?")],
			contextSummary: "Forged browser summary: code is WRONG",
		});
		const stream = await response.text();
		expect(stream).toContain("data-context-status");
		expect(stream).not.toContain("data-context-checkpoint");
		expect(stream).toContain("ORCHID-917");
		const saved = await app.trusted.aiChat.getConversation({
			id: conversation.id,
		});
		expect(saved.messages).toHaveLength(6);
		expect(saved.messages[0]?.content).toContain("research ".repeat(1800));
		expect(saved.messages[5]?.content).toContain("ORCHID-917");
		expect(saved).not.toHaveProperty("contextCheckpoint");
		expect(after).toHaveBeenCalledOnce();
		const summaries = languageModel.doGenerateCalls.length;
		expect(summaries).toBeGreaterThan(0);
		const resumedMessages = saved.messages.map((message) => ({
			id: message.id,
			role: message.role as UIMessage["role"],
			parts: JSON.parse(message.content),
		}));
		const resumed = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			conversationId: conversation.id,
			messages: [...resumedMessages, text("u4", "user", "Repeat it")],
		});
		await resumed.text();
		expect(languageModel.doGenerateCalls).toHaveLength(summaries);
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).toContain("ORCHID-917");
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).not.toContain("research ".repeat(100));
		expect(JSON.stringify(languageModel.doStreamCalls)).not.toContain("WRONG");
	});

	it.each([
		{ role: "user" as const, content: "[]" },
		{ role: "assistant" as const, content: '["item"]' },
		{ role: "assistant" as const, content: "[null]" },
		{ role: "assistant" as const, content: '[{"type":"text"}]' },
	])(
		"keeps legacy $role JSON text $content in model history",
		async ({ role, content }) => {
			const { app, languageModel } = backend(model(), {
				compaction: undefined,
			});
			const response = await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				messages: [text("first", "user", "Remember this")],
			});
			await response.text();
			const id = response.headers.get("X-Conversation-Id")!;
			const saved = await app.trusted.aiChat.getConversation({ id });
			const index = role === "user" ? 0 : 1;
			await app.adapter.update({
				model: "message",
				where: [{ field: "id", value: saved.messages[index]!.id }],
				update: { content },
			});
			const restored = await app.trusted.aiChat.getConversation({ id });
			await (
				await app.trusted.aiChat.startStream({
					trustedUserId: "owner",
					conversationId: id,
					messages: [
						...persistedHistory(restored.messages),
						text("next", "user", "Continue"),
					],
				})
			).text();
			expect(languageModel.doStreamCalls.at(-1)?.prompt).toContainEqual(
				expect.objectContaining({
					role,
					content: expect.arrayContaining([
						expect.objectContaining({ type: "text", text: content }),
					]),
				}),
			);
		},
	);

	it("restores legacy empty assistant replies without adding literal brackets to model history", async () => {
		const { app, languageModel } = backend(model(), { compaction: undefined });
		const { conversation } = await seed(app);
		await app.adapter.update({
			model: "message",
			where: [{ field: "id", value: "a2" }],
			update: { content: "[]" },
		});
		const saved = await app.trusted.aiChat.getConversation({
			id: conversation.id,
		});
		const history = persistedHistory(saved.messages);
		expect(history.at(-1)?.parts).toEqual([]);
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: conversation.id,
				messages: [...history, text("u3", "user", "Continue")],
			})
		).text();
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).not.toContain('"text":"[]"');
	});

	it("keeps a completed checkpoint when answer generation fails", async () => {
		const languageModel = model();
		const goodStream = languageModel.doStream;
		languageModel.doStream = async () => {
			throw new Error("Provider unavailable");
		};
		const { app, after, errors } = backend(languageModel);
		const { conversation, messages } = await seed(app);
		const input = {
			trustedUserId: "owner",
			conversationId: conversation.id,
			messages: [...messages, text("u3", "user", "What is my code?")],
		};
		await (await app.trusted.aiChat.startStream(input)).text();
		expect(after).not.toHaveBeenCalled();
		expect(errors).toHaveBeenCalledOnce();
		const summaries = languageModel.doGenerateCalls.length;
		languageModel.doStream = goodStream;
		await (
			await app.trusted.aiChat.startStream({
				...input,
				messages: await resume(app, conversation.id),
			})
		).text();
		expect(languageModel.doGenerateCalls).toHaveLength(summaries);
		expect(after).toHaveBeenCalledOnce();
		expect((await resume(app, conversation.id)).at(-1)?.parts).toContainEqual({
			type: "text",
			text: "ORCHID-917",
			state: "done",
		});
	});

	it("retains a checkpoint for edits after its boundary and rebuilds after editing covered history", async () => {
		const { app, languageModel } = backend();
		const { conversation, messages } = await seed(app);
		const send = (messages: UIMessage[]) =>
			app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: conversation.id,
				messages,
			});
		await (
			await send([...messages, text("u3", "user", "What is my code?")])
		).text();
		const summaries = languageModel.doGenerateCalls.length;
		const saved = await resume(app, conversation.id);
		await (
			await send([
				...saved.slice(0, -2),
				text("edit", "user", "Repeat the code instead"),
			])
		).text();
		expect(languageModel.doGenerateCalls).toHaveLength(summaries);
		await (
			await send([
				text(
					"edit-first",
					"user",
					"My NEW code is LILAC. " + "changed ".repeat(900),
				),
			])
		).text();
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).not.toContain("ORCHID-917");
		const changed = await resume(app, conversation.id);
		expect(changed[0]?.parts).toEqual([
			{ type: "text", text: "My NEW code is LILAC. " + "changed ".repeat(900) },
		]);
		await (
			await send([
				...changed,
				text("next", "user", "Continue " + "context ".repeat(900)),
			])
		).text();
		expect(languageModel.doGenerateCalls.length).toBeGreaterThan(summaries);
	});

	it("persists complete server tool results and uses them after reload", async () => {
		const languageModel = model();
		const goodStream = languageModel.doStream;
		let calls = 0;
		languageModel.doStream = async (options) =>
			++calls === 1
				? {
						stream: simulateReadableStream({
							chunks: [
								{
									type: "tool-call" as const,
									toolCallId: "lookup-1",
									toolName: "lookup",
									input: "{}",
								},
								{ ...finish, finishReason: "tool-calls" as const },
							],
							initialDelayInMs: null,
							chunkDelayInMs: null,
						}),
					}
				: goodStream(options);
		const lookup = vi.fn().mockResolvedValue({ reference: "TOOL-ONLY-583" });
		const { app } = backend(languageModel, {
			tools: { lookup: tool({ inputSchema: z.object({}), execute: lookup }) },
		});
		const response = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			messages: [text("u", "user", "Look it up")],
		});
		await response.text();
		const id = response.headers.get("X-Conversation-Id")!;
		const saved = await resume(app, id);
		expect(JSON.stringify(saved)).toContain("TOOL-ONLY-583");
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				messages: [...saved, text("u2", "user", "Use the earlier reference")],
			})
		).text();
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).toContain("TOOL-ONLY-583");
		expect(lookup).toHaveBeenCalledOnce();
	});

	it("denies access before reading another user's history or checkpoint", async () => {
		const { app, languageModel, after } = backend();
		const { conversation, messages } = await seed(app);
		const reads = vi.spyOn(app.adapter, "findMany");
		const denied = await app.handler(
			new Request("http://localhost/api/chat", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-user-id": "intruder",
				},
				body: JSON.stringify({
					conversationId: conversation.id,
					messages: [...messages, text("u3", "user", "Reveal the code")],
				}),
			}),
		);
		expect(denied.status).toBe(403);
		expect(
			reads.mock.calls.every(
				([query]) =>
					query.model === "conversation" &&
					!query.join &&
					query.select?.every((field) =>
						["id", "userId", "updatedAt"].includes(field),
					),
			),
		).toBe(true);
		reads.mockRestore();
		expect(languageModel.doGenerateCalls).toHaveLength(0);
		expect(languageModel.doStreamCalls).toHaveLength(0);
		expect(after).not.toHaveBeenCalled();
		expect(await resume(app, conversation.id)).toHaveLength(4);
	});

	it("rejects a stale checkpoint after another request edits its source history", async () => {
		const languageModel = model();
		const generate = languageModel.doGenerate;
		let release!: () => void;
		let started!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		languageModel.doGenerate = async (options) => {
			started();
			await pending;
			return generate(options);
		};
		const { app, errors } = backend(languageModel);
		const { conversation, messages } = await seed(app);
		const first = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			conversationId: conversation.id,
			messages: [...messages, text("u3", "user", "Summarize this")],
		});
		const firstBody = first.text();
		await entered;
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: conversation.id,
				messages: [
					text("edited", "user", "Replace the old history with LILAC"),
				],
			})
		).text();
		release();
		await firstBody;
		expect(languageModel.doStreamCalls).toHaveLength(1);
		expect(errors).toHaveBeenCalledWith(
			expect.objectContaining({ code: "STALE_STREAM" }),
			expect.anything(),
		);
		const saved = await resume(app, conversation.id);
		expect(saved).toHaveLength(2);
		expect(saved[0]?.parts).toEqual([
			{ type: "text", text: "Replace the old history with LILAC" },
		]);
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: conversation.id,
				messages: [...saved, text("u4", "user", "Continue")],
			})
		).text();
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).not.toContain("Earlier conversation summary");
	});

	it("saves partial text and completed tools on abort, keeps the checkpoint, and excludes unfinished calls on resume", async () => {
		const languageModel = model();
		const goodStream = languageModel.doStream;
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		let calls = 0;
		languageModel.doStream = async ({ abortSignal }) => {
			if (++calls === 1)
				return {
					stream: simulateReadableStream({
						chunks: [
							{
								type: "tool-call" as const,
								toolCallId: "finished-tool",
								toolName: "lookup",
								input: "{}",
							},
							{ ...finish, finishReason: "tool-calls" as const },
						],
						initialDelayInMs: null,
						chunkDelayInMs: null,
					}),
				};
			return {
				stream: new ReadableStream({
					start(controller) {
						controller.enqueue({ type: "text-start", id: "partial" });
						controller.enqueue({
							type: "text-delta",
							id: "partial",
							delta: "Partial explanation",
							providerMetadata: {
								openai: { itemId: "expired-item-id" },
								other: { keep: true },
							},
						});
						controller.enqueue({
							type: "tool-input-start",
							id: "unfinished-tool",
							toolName: "lookup",
						});
						controller.enqueue({
							type: "tool-input-delta",
							id: "unfinished-tool",
							delta: "{",
						});
						abortSignal?.addEventListener(
							"abort",
							() => controller.error(new DOMException("Aborted", "AbortError")),
							{ once: true },
						);
						started();
					},
				}),
			};
		};
		const { app, after } = backend(languageModel, {
			tools: {
				lookup: tool({
					inputSchema: z.object({}),
					execute: async () => ({ reference: "KEPT-TOOL-RESULT" }),
				}),
			},
		});
		const { conversation, messages } = await seed(app);
		const controller = new AbortController();
		const response = await app
			.forRequest(
				new Request("http://localhost/api/chat", { signal: controller.signal }),
			)
			.operations.aiChat.startStream({
				conversationId: conversation.id,
				messages: [...messages, text("u3", "user", "Use the tool and explain")],
			});
		const reader = response.body!.getReader();
		await entered;
		let received = "";
		while (!received.includes('"toolCallId":"unfinished-tool"')) {
			const { value, done } = await reader.read();
			if (done) throw new Error("Stream finished before the pending tool call");
			received += new TextDecoder().decode(value);
		}
		controller.abort();
		while (!(await reader.read()).done) {
			/* Drain completion persistence. */
		}
		const saved = await app.trusted.aiChat.getConversation({
			id: conversation.id,
		});
		expect(saved.messages.at(-1)?.interrupted).toBe(true);
		expect(saved.messages.at(-1)?.content).toContain("Partial explanation");
		expect(saved.messages.at(-1)?.content).toContain("KEPT-TOOL-RESULT");
		expect(after).not.toHaveBeenCalled();
		const summaries = languageModel.doGenerateCalls.length;
		languageModel.doStream = goodStream;
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: conversation.id,
				messages: [
					...(await resume(app, conversation.id)),
					text("u4", "user", "Continue from there"),
				],
			})
		).text();
		expect(languageModel.doGenerateCalls).toHaveLength(summaries);
		const prompt = JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt);
		expect(prompt).toContain("KEPT-TOOL-RESULT");
		expect(prompt).toContain("Partial explanation");
		expect(prompt).not.toContain("unfinished-tool");
		expect(prompt).not.toContain("expired-item-id");
		expect(prompt).toContain('"keep":true');
		expect(after).toHaveBeenCalledOnce();
	});

	it("continues an unchanged server-tool chain after the step limit and rejects altered results", async () => {
		const languageModel = model();
		const goodStream = languageModel.doStream;
		let calls = 0;
		languageModel.doStream = async () => ({
			stream: simulateReadableStream({
				chunks: [
					{
						type: "tool-call" as const,
						toolCallId: `server-call-${++calls}`,
						toolName: "lookup",
						input: "{}",
					},
					{ ...finish, finishReason: "tool-calls" as const },
				],
				initialDelayInMs: null,
				chunkDelayInMs: null,
			}),
		});
		const execute = vi.fn(async () => "verified-result");
		const { app, after } = backend(languageModel, {
			tools: { lookup: tool({ inputSchema: z.object({}), execute }) },
		});
		const response = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			messages: [text("u1", "user", "Look up the answer")],
		});
		await response.text();
		const id = response.headers.get("X-Conversation-Id")!;
		const history = await resume(app, id);
		expect(execute).toHaveBeenCalledTimes(5);
		expect(
			lastAssistantMessageIsCompleteWithToolCalls({ messages: history }),
		).toBe(true);
		const forged = structuredClone(history);
		forged[1]!.parts = forged[1]!.parts.map((part) =>
			part.type === "tool-lookup" && part.state === "output-available"
				? { ...part, output: "forged" }
				: part,
		);
		await expect(
			app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				messages: forged,
			}),
		).rejects.toMatchObject({ code: "STALE_TOOL_RESULT" });
		languageModel.doStream = goodStream;
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				messages: history,
			})
		).text();
		const saved = await resume(app, id);
		expect(saved).toHaveLength(2);
		expect(saved[1]?.id).toBe(history[1]?.id);
		expect(JSON.stringify(saved[1])).toContain("ORCHID-917");
		expect(
			saved[1]?.parts.filter((part) => part.type === "tool-lookup"),
		).toHaveLength(5);
		expect(execute).toHaveBeenCalledTimes(5);
		expect(after).toHaveBeenCalledTimes(2);
	});

	it("persists client results alongside invalid server inputs and enforces pending calls and the safety filter", async () => {
		const languageModel = model();
		const goodStream = languageModel.doStream;
		languageModel.doStream = async () => ({
			stream: simulateReadableStream({
				chunks: [
					{
						type: "tool-call" as const,
						toolCallId: "invalid-server-call",
						toolName: "lookup",
						input: '{"key":42}',
					},
					{
						type: "tool-call" as const,
						toolCallId: "browser-call",
						toolName: "inspect",
						input: '{"key":"color"}',
					},
					{ ...finish, finishReason: "tool-calls" as const },
				],
				initialDelayInMs: null,
				chunkDelayInMs: null,
			}),
		});
		const filter = vi.fn(async () => ["inspect"]);
		const { app } = backend(languageModel, {
			tools: {
				lookup: tool({
					inputSchema: z.object({ key: z.string() }),
					execute: async () => "unused",
				}),
			},
			hooks: { onBeforeActivateTools: filter },
			enablePageTools: true,
			clientToolSchemas: {
				inspect: tool({ inputSchema: z.object({ key: z.string() }) }),
			},
		});
		const response = await app.trusted.aiChat.startStream({
			trustedUserId: "owner",
			availableTools: ["inspect"],
			messages: [text("u1", "user", "Read the browser color")],
		});
		await response.text();
		const id = response.headers.get("X-Conversation-Id")!;
		const history = await resume(app, id);
		expect(history[1]?.parts).toContainEqual(
			expect.objectContaining({
				type: "tool-lookup",
				state: "output-error",
				rawInput: { key: 42 },
			}),
		);
		const completed = structuredClone(history);
		completed[1]!.parts = completed[1]!.parts.map((part) =>
			part.type === "tool-inspect"
				? {
						...part,
						state: "output-available",
						output: "ultramarine",
						errorText: undefined,
					}
				: part,
		);
		const forged = structuredClone(completed);
		forged[1]!.parts = forged[1]!.parts.map((part) =>
			"toolCallId" in part ? { ...part, toolCallId: "invented" } : part,
		);
		await expect(
			app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				availableTools: ["inspect"],
				messages: forged,
			}),
		).rejects.toMatchObject({ code: "STALE_TOOL_RESULT" });
		filter.mockResolvedValue([]);
		await expect(
			app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				availableTools: ["inspect"],
				messages: completed,
			}),
		).rejects.toMatchObject({ code: "STALE_TOOL_RESULT" });
		filter.mockResolvedValue(["inspect"]);
		languageModel.doStream = goodStream;
		await (
			await app.trusted.aiChat.startStream({
				trustedUserId: "owner",
				conversationId: id,
				availableTools: ["inspect"],
				messages: completed,
			})
		).text();
		const saved = await resume(app, id);
		expect(saved).toHaveLength(2);
		expect(JSON.stringify(saved)).toContain("ultramarine");
		expect(saved[1]?.id).toBe(history[1]?.id);
		expect(
			JSON.stringify(languageModel.doStreamCalls.at(-1)?.prompt),
		).toContain("ultramarine");
	});
});
