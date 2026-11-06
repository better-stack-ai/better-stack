import type { AiChatMode } from "./overrides";

/** Content-free usage events. No prompts, answers, page descriptions, or tool outputs. */
export type AiChatAnalyticsEvent = {
	/** Caller-supplied page identity; omit sensitive values. */
	pageKey?: string;
	/** Page label, without its description or document content. */
	routeName?: string;
	/** Registered client mode, not an assertion about the viewer's identity. */
	mode: AiChatMode;
} & (
	| {
			type:
				| "widget_opened"
				| "widget_closed"
				| "intro_tip_shown"
				| "conversation_cleared";
	  }
	| { type: "intro_tip_dismissed"; reason: "timeout" | "manual" | "open" }
	| { type: "suggestion_selected"; index: number }
	| {
			type: "message_submitted";
			inputKind: "typed" | "suggestion" | "edit" | "retry";
			inputLength: number;
			messageCount: number;
			attachmentCount: number;
	  }
	| {
			type: "response_completed";
			durationMs: number;
			outputLength: number;
			toolCallCount: number;
	  }
	| { type: "response_failed"; durationMs: number }
);
