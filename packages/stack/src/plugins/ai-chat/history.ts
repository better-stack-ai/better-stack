import type { UIMessage } from "ai";
import type { Message } from "./types";

function isMessagePart(value: unknown): boolean {
	if (!value || typeof value !== "object" || !("type" in value)) return false;
	const part = value as Record<string, unknown>;
	if (typeof part.type !== "string") return false;
	switch (part.type) {
		case "text":
		case "reasoning":
			return typeof part.text === "string";
		case "file":
			return typeof part.url === "string" && typeof part.mediaType === "string";
		case "source-url":
			return typeof part.sourceId === "string" && typeof part.url === "string";
		case "source-document":
			return (
				typeof part.sourceId === "string" &&
				typeof part.mediaType === "string" &&
				typeof part.title === "string"
			);
		case "step-start":
			return true;
		default:
			if (part.type.startsWith("data-")) return "data" in part;
			return (
				(part.type.startsWith("tool-") ||
					(part.type === "dynamic-tool" &&
						typeof part.toolName === "string")) &&
				typeof part.toolCallId === "string" &&
				[
					"input-streaming",
					"input-available",
					"output-available",
					"output-error",
				].includes(String(part.state))
			);
	}
}

export function persistedHistory(
	messages: readonly Pick<Message, "id" | "role" | "content" | "interrupted">[],
): UIMessage[] {
	return messages
		.filter((message) => message.role !== "data")
		.map((message) => {
			let parts: UIMessage["parts"];
			try {
				const parsed = JSON.parse(message.content);
				parts =
					Array.isArray(parsed) &&
					parsed.length > 0 &&
					parsed.every(isMessagePart)
						? parsed
						: [{ type: "text", text: message.content }];
			} catch {
				parts = [{ type: "text", text: message.content }];
			}
			return {
				id: message.id,
				role: message.role as UIMessage["role"],
				parts,
				...(message.interrupted ? { metadata: { interrupted: true } } : {}),
			};
		});
}
