import { createDbPlugin } from "@btst/db";

/** Definitions persist in the adapter; evaluation logs are ephemeral. */
export const featureFlagsSchema = createDbPlugin("feature-flags", {
	flag: {
		modelName: "flag",
		fields: {
			key: { type: "string", required: true, unique: true },
			name: { type: "string", required: true },
			description: { type: "string", required: false },
			type: { type: "string", defaultValue: "boolean" },
			enabled: { type: "boolean", defaultValue: false },
			rolloutPct: { type: "number", required: false },
			segments: { type: "string", defaultValue: "[]" },
			tags: { type: "string", defaultValue: "[]" },
			archivedAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
