import { createDbPlugin } from "@btst/db";

/** Analytics stores no cookies, raw IP addresses, or raw user-agent strings. */
export const analyticsSchema = createDbPlugin("analytics", {
	pageView: {
		modelName: "pageView",
		fields: {
			path: { type: "string", required: true },
			referrer: { type: "string", required: false },
			country: { type: "string", required: false },
			device: { type: "string", required: false },
			browser: { type: "string", required: false },
			sessionId: { type: "string", required: true },
			timestamp: { type: "date", defaultValue: () => new Date() },
		},
	},
	customEvent: {
		modelName: "customEvent",
		fields: {
			name: { type: "string", required: true },
			path: { type: "string", required: true },
			properties: { type: "string", required: false },
			sessionId: { type: "string", required: true },
			timestamp: { type: "date", defaultValue: () => new Date() },
		},
	},
});
