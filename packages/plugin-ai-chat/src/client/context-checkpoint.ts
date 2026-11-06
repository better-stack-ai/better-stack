import type { UIMessage } from "ai";

/** Browser-only snapshot; never replaces or mutates the visible transcript. */
export interface ContextCheckpoint {
	summary: string;
	throughMessageId: string;
	prefix: string;
}

export function captureContextCheckpoint(
	messages: UIMessage[],
	summary: string,
	throughMessageId: string,
): ContextCheckpoint | undefined {
	const index = messages.findIndex(
		(message) => message.id === throughMessageId,
	);
	if (index < 0) return undefined;
	return {
		summary,
		throughMessageId,
		prefix: JSON.stringify(messages.slice(0, index + 1)),
	};
}

export function contextRequest(
	messages: UIMessage[],
	checkpoint?: ContextCheckpoint,
) {
	if (checkpoint) {
		const index = messages.findIndex(
			(message) => message.id === checkpoint.throughMessageId,
		);
		if (
			index >= 0 &&
			JSON.stringify(messages.slice(0, index + 1)) === checkpoint.prefix
		) {
			return {
				messages: messages.slice(index + 1),
				contextSummary: checkpoint.summary,
			};
		}
	}
	// Editing or retrying a summarized turn invalidates the snapshot. Resend
	// the original transcript so the server builds a fresh summary if needed.
	return { messages };
}
