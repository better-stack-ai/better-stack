import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const key = z.object({ key: z.string() });
/** Separate management/log access from browser-visible evaluation results. */
export const featureFlagsPermissions = definePermissions("featureFlags", {
	flags: {
		read: permission(z.object({ key: z.string().optional() })),
		create: permission(key),
		update: permission(key),
		toggle: permission(key),
		archive: permission(key),
	},
	evaluations: {
		read: permission(key),
		evaluate: permission(
			z.object({
				scope: z.enum(["single", "all"]),
				key: z.string().optional(),
			}),
		),
	},
});
