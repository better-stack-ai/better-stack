import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const conversationRecordFacts = {
	conversationId: z.string(),
	exists: z.boolean(),
	ownerId: z.string().optional(),
};

const messageConversationFacts = {
	conversationId: z.string().optional(),
	ownerId: z.string().optional(),
};

/** Browser-safe, schema-backed permissions published by AI Chat. */
export const aiChatPermissions = definePermissions("aiChat", {
	conversation: {
		/** Read the scoped history collection or one server-resolved conversation. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({
					scope: z.literal("record"),
					...conversationRecordFacts,
				}),
			]),
		),
		/** Create a persisted conversation. */
		create: permission(),
		/** Rename a server-resolved conversation. */
		update: permission(z.object(conversationRecordFacts)),
		/** Delete a server-resolved conversation. */
		delete: permission(z.object(conversationRecordFacts)),
	},
	message: {
		/** Send a new message, optionally creating its conversation. */
		send: permission(
			z.object({
				...messageConversationFacts,
				createsConversation: z.boolean(),
			}),
		),
		/** Replace a user message and regenerate the truncated tail. */
		edit: permission(
			z.object({
				conversationId: z.string(),
				messageId: z.string(),
				ownerId: z.string().optional(),
			}),
		),
		/** Retry the assistant response after a server-resolved message. */
		retry: permission(
			z.object({
				conversationId: z.string(),
				messageId: z.string(),
				ownerId: z.string().optional(),
			}),
		),
	},
	attachment: {
		/** Send validated file parts to the configured model. */
		send: permission(
			z.object({
				...messageConversationFacts,
				mediaTypes: z.array(z.string()),
			}),
		),
	},
	tool: {
		/** Activate the server-registered tools that survived route validation. */
		activate: permission(
			z.object({
				...messageConversationFacts,
				routeName: z.string().optional(),
				toolNames: z.array(z.string()),
			}),
		),
	},
	stream: {
		/** Start one validated model stream for the server-derived message intent. */
		start: permission(
			z.object({
				...messageConversationFacts,
				createsConversation: z.boolean(),
				intent: z.enum(["send", "edit", "retry", "tool-result"]),
			}),
		),
	},
});
