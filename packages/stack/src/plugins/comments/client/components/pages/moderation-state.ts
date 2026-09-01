import type { ListStateSchema } from "@btst/stack/client";
import type { CommentStatus } from "../../../types";

/** URL-backed state shared by the moderation route gate and queue UI. */
export const MODERATION_LIST_STATE_SCHEMA = {
	tab: { type: "string", default: "pending" },
	page: { type: "number", default: 1 },
} as const satisfies ListStateSchema;

/** Normalize an untrusted URL tab to a schema-backed moderation status. */
export function resolveModerationStatus(tab: string): CommentStatus {
	return tab === "approved" || tab === "spam" ? tab : "pending";
}
