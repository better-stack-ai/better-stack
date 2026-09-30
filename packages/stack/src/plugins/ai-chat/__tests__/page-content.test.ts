import { createMemoryAdapter } from "@btst/adapter-memory";
import { MockLanguageModelV2 } from "ai/test";
import { simulateReadableStream } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { aiChatBackendPlugin } from "../api";

async function readPage(
	path: string,
	pathSchema: z.ZodType<string, string> = z
		.string()
		.regex(/^\/articles\/[^/?#]+$/),
	content: unknown = { content: "reference" },
) {
	const resolve = vi.fn().mockResolvedValue(content);
	let step = 0;
	const model = new MockLanguageModelV2({
		doStream: async () => ({
			stream: simulateReadableStream<
				Awaited<
					ReturnType<MockLanguageModelV2["doStream"]>
				>["stream"] extends ReadableStream<infer T>
					? T
					: never
			>({
				chunks:
					step++ === 0
						? [
								{
									type: "tool-call",
									toolCallId: "read-1",
									toolName: "readPage",
									input: JSON.stringify({ path }),
								},
								{
									type: "finish",
									finishReason: "tool-calls",
									usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
								},
							]
						: [
								{ type: "text-start", id: "answer" },
								{
									type: "text-delta",
									id: "answer",
									delta: "Page read completed.",
								},
								{ type: "text-end", id: "answer" },
								{
									type: "finish",
									finishReason: "stop",
									usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
								},
							],
				initialDelayInMs: null,
				chunkDelayInMs: null,
			}),
		}),
	});
	const app = createBackendStack({
		basePath: "/api",
		plugins: {
			aiChat: aiChatBackendPlugin({
				model,
				access: "public",
				pageContent: { pathSchema, resolve },
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
	const response = await app.handler(
		new Request("http://localhost/api/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				messages: [
					{
						id: "q",
						role: "user",
						parts: [{ type: "text", text: "Read the page" }],
					},
				],
				pageContext: "/articles/one",
			}),
		}),
	);
	expect(response.status).toBe(200);
	const stream = await response.text();
	return { resolve, model, stream };
}

describe("page reader AI SDK execution", () => {
	it("passes full content through the model loop without truncation", async () => {
		const content = "long reference ".repeat(10000) + "TAIL-9372";
		const { model, stream } = await readPage("/articles/one", undefined, {
			content,
		});
		expect(model.doStreamCalls).toHaveLength(2);
		expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain(content);
		expect(stream).toContain("Page read completed.");
	});
	it.each(["https://private.example/secret", "/articles/" + "x".repeat(16000)])(
		"rejects invalid input before invoking the loader (%#)",
		async (path) => {
			const { resolve, stream } = await readPage(path);
			expect(resolve).not.toHaveBeenCalled();
			expect(stream).toContain("tool-input-error");
		},
	);
	it("applies a path transformation exactly once", async () => {
		const schema = z
			.string()
			.regex(/^\/articles\//)
			.transform((path) => decodeURIComponent(path));
		const { resolve } = await readPage("/articles/encoded%2520space", schema);
		expect(resolve).toHaveBeenCalledOnce();
		expect(resolve.mock.calls[0]?.[0]).toBe("/articles/encoded%20space");
	});
	it("returns an unavailable result without inventing page content", async () => {
		const { stream } = await readPage("/articles/draft", undefined, null);
		expect(stream).toContain('"error":"Page not found."');
	});
});
