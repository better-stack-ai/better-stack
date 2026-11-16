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
			operatingSystem: { type: "string", required: false },
			hostname: { type: "string", required: false },
			route: { type: "string", required: false },
			environment: { type: "string", required: false },
			utmSource: { type: "string", required: false },
			utmMedium: { type: "string", required: false },
			utmCampaign: { type: "string", required: false },
			utmTerm: { type: "string", required: false },
			utmContent: { type: "string", required: false },

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
			environment: { type: "string", required: false },
			sessionId: { type: "string", required: true },
			timestamp: { type: "date", defaultValue: () => new Date() },
		},
	},
	experimentExposure: {
		modelName: "experimentExposure",
		fields: {
			dedupKey: { type: "string", required: true, unique: true },
			experimentKey: { type: "string", required: true },
			flagKey: { type: "string", required: true },
			configurationVersion: { type: "string", required: true },
			variant: { type: "string", required: true },
			conversionEvent: { type: "string", required: true },
			attributionWindowMs: { type: "number", required: true },
			path: { type: "string", required: true },
			sessionId: { type: "string", required: true },
			timestamp: { type: "date", defaultValue: () => new Date() },
		},
	},
	experimentActivation: {
		modelName: "experimentActivation",
		fields: {
			experimentKey: { type: "string", required: true },
			sessionId: { type: "string", required: true },
			exposureKey: { type: "string", required: true },
			timestamp: { type: "date", defaultValue: () => new Date() },
		},
	},
});
