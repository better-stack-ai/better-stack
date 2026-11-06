import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const boardFacts = {
	boardId: z.string(),
	ownerId: z.string().optional(),
	organizationId: z.string().optional(),
};

const taskStatusFacts = {
	assigneeId: z.string().optional(),
	isArchived: z.boolean(),
};

/** Browser-safe, schema-backed permissions published by Kanban. */
export const kanbanPermissions = definePermissions("kanban", {
	board: {
		/** Read the server-scoped board collection or one resolved board. */
		read: permission(
			z.discriminatedUnion("scope", [
				z.object({ scope: z.literal("collection") }),
				z.object({
					scope: z.literal("record"),
					...boardFacts,
					exists: z.boolean(),
				}),
			]),
		),
		/** Create a board. */
		create: permission(),
		/** Update a server-resolved board. */
		update: permission(z.object(boardFacts)),
		/** Delete a server-resolved board. */
		delete: permission(z.object(boardFacts)),
	},
	column: {
		/** Create a column on a server-resolved board. */
		create: permission(z.object(boardFacts)),
		/** Update a server-resolved column. */
		update: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
			}),
		),
		/** Delete a server-resolved column. */
		delete: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
			}),
		),
		/** Reorder the complete column set of a server-resolved board. */
		reorder: permission(z.object(boardFacts)),
	},
	task: {
		/** Create a task in a server-resolved board column. */
		create: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
			}),
		),
		/** Update a server-resolved task. */
		update: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
				taskId: z.string(),
				...taskStatusFacts,
			}),
		),
		/** Move a server-resolved task within or between board columns. */
		move: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
				targetColumnId: z.string().optional(),
				taskId: z.string(),
				...taskStatusFacts,
			}),
		),
		/** Delete a server-resolved task. */
		delete: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
				taskId: z.string(),
				...taskStatusFacts,
			}),
		),
		/** Reorder the complete task set of a server-resolved column. */
		reorder: permission(
			z.object({
				...boardFacts,
				columnId: z.string(),
			}),
		),
	},
});
