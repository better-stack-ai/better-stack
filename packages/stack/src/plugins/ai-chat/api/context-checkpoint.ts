import { createHash } from "node:crypto";
import type { UIMessage } from "ai";
import { z } from "zod";
import type { Message } from "../types";

const checkpointSchema = z.object({
	version: z.literal(1),
	summary: z.string().min(1).max(32_000),
	throughMessageId: z.string(),
	prefixHash: z.string(),
});

function prefixHash(messages: readonly Message[]) {
	return createHash("sha256")
		.update(
			JSON.stringify(
				messages.map(({ id, role, content, interrupted }) => ({
					id,
					role,
					content,
					interrupted: Boolean(interrupted),
				})),
			),
		)
		.digest("hex");
}

/** Checkpoints cover committed database messages, never browser-supplied history. */
export function createContextCheckpoint(
	messages: readonly Message[],
	summary: string,
	throughMessageId: string,
): string {
	const boundary = messages.findIndex(
		(message) => message.id === throughMessageId,
	);
	if (boundary < 0) throw new Error("Checkpoint boundary is not persisted.");
	return JSON.stringify(
		checkpointSchema.parse({
			version: 1,
			summary,
			throughMessageId,
			prefixHash: prefixHash(messages.slice(0, boundary + 1)),
		}),
	);
}

export function readContextCheckpoint(
	value: string | null | undefined,
	messages: readonly Message[],
) {
	if (!value) return undefined;
	try {
		const checkpoint = checkpointSchema.parse(JSON.parse(value));
		const boundary = messages.findIndex(
			(message) => message.id === checkpoint.throughMessageId,
		);
		if (
			boundary < 0 ||
			prefixHash(messages.slice(0, boundary + 1)) !== checkpoint.prefixHash
		)
			return undefined;
		return { ...checkpoint, boundary };
	} catch {
		return undefined;
	}
}

export function persistedHistory(messages: readonly Message[]): UIMessage[] {
	return messages
		.filter((message) => message.role !== "data")
		.map((message) => {
			let parts: UIMessage["parts"];
			try {
				const parsed = JSON.parse(message.content);
				parts = Array.isArray(parsed)
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
