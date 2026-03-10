import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { openai } from "@ai-sdk/openai";

// In-memory adapter only: Next.js evaluates this module in multiple bundle contexts
// (API routes + page bundle) that share the same process. Pin to globalThis so both
// contexts reference the same in-memory store.
const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
};

function createStack() {
	const model = openai("gpt-4o-mini");

	return stack({
		basePath: "/api/data",
		plugins: {
			aiChat: aiChatBackendPlugin({
				model,
				mode: "public",
				systemPrompt:
					"You are a helpful assistant in the BTST AI Chat demo. Help users explore the BTST framework and its plugins.",
			}),
			openApi: openApiBackendPlugin({
				title: "BTST AI Chat Demo API",
				description: "API for the BTST AI Chat plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

export const { handler, dbSchema } = myStack;
