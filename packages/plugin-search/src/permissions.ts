import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

export const searchPermissions = definePermissions("search", {
	query: {
		read: permission(z.object({ sources: z.array(z.string()) })),
	},
});
