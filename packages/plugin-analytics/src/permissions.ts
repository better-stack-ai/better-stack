import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

/** Browser-safe permission descriptors for public ingestion and private analytics. */
export const analyticsPermissions = definePermissions("analytics", {
	events: {
		ingest: permission(z.object({ kind: z.enum(["pageview", "event"]) })),
		cleanup: permission(z.object({})),
	},
	experiments: {
		expose: permission(z.object({ experimentKey: z.string() })),
		read: permission(z.object({ experimentKey: z.string() })),
	},
	dashboard: {
		read: permission(z.object({})),
		export: permission(z.object({})),
	},
});
