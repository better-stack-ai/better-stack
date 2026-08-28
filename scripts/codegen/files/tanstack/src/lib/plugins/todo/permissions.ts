import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const todoIdFacts = z.object({ id: z.string().min(1) });

/** Browser-safe permission descriptors for the generated Todo plugin. */
export const todoPermissions = definePermissions("todos", {
	todo: {
		read: permission(),
		create: permission(),
		update: permission(todoIdFacts),
		delete: permission(todoIdFacts),
	},
});
