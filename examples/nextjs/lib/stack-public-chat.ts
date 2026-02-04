import { createMemoryAdapter } from "./adapters-build-check";
import { stack } from "@btst/stack";
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api";
import { openai } from "@ai-sdk/openai";

/**
 * AI Chat backend plugin configured for PUBLIC mode
 * 
 * This demonstrates a public chatbot configuration:
 * - No authentication required
 * - Conversations are NOT persisted to database
 * - Rate limiting can be implemented via hooks
 */

// Simple in-memory rate limiter for demo purposes
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // max requests per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
	const now = Date.now();
	const record = rateLimits.get(ip);

	if (!record || now > record.resetAt) {
		// New window
		rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
		return true;
	}

	if (record.count >= RATE_LIMIT) {
		console.log(`[Rate Limit] Blocked: ${ip} exceeded ${RATE_LIMIT} requests`);
		return false;
	}

	record.count++;
	return true;
}

const { handler, dbSchema } = stack({
	basePath: "/api/public-chat",
	plugins: {
		// AI Chat in PUBLIC mode - no persistence
		aiChat: aiChatBackendPlugin({
			model: openai("gpt-4o"),
			mode: "public", // Stateless mode - no database persistence
			systemPrompt:
				"You are a helpful customer support assistant. Be concise and friendly.",
			hooks: {
				onBeforeChat: async (messages, ctx) => {
					// Example: Rate limiting by IP
					const ip =
						ctx.headers?.get("x-forwarded-for") ||
						ctx.headers?.get("x-real-ip") ||
						"unknown";
					console.log(`[Public Chat] Request from IP: ${ip}`);

					const allowed = checkRateLimit(ip);
					if (!allowed) {
						console.log(`[Public Chat] Rate limit exceeded for ${ip}`);
						return false;
					}

					console.log(
						`[Public Chat] Processing ${messages.length} message(s)`,
					);
					return true;
				},
			},
		}),
	},
	adapter: (db) => createMemoryAdapter(db)({}),
});

export { handler, dbSchema };
