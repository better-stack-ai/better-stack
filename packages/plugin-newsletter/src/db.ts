import { createDbPlugin } from "@btst/db";

/** Isolated newsletter tables; token lookup values are SHA-256 digests. Retry HTML contains secret bearer links. */
export const newsletterSchema = createDbPlugin("newsletter", {
	subscriber: {
		modelName: "newsletterSubscriber",
		fields: {
			email: { type: "string", required: true, unique: true },
			name: { type: "string", required: false },
			status: { type: "string", defaultValue: "subscribed" },
			transactionOnly: { type: "boolean", defaultValue: false },
			tags: { type: "string", defaultValue: "[]" },
			confirmedAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
			confirmationToken: { type: "string", required: false },
			confirmationExpiresAt: { type: "date", required: false },
			confirmationSentAt: { type: "date", required: false },
		},
	},
	campaign: {
		modelName: "newsletterCampaign",
		fields: {
			subject: { type: "string", required: true },
			previewText: { type: "string", required: false },
			fromName: { type: "string", required: true },
			fromEmail: { type: "string", required: true },
			replyTo: { type: "string", required: false },
			body: { type: "string", required: true },
			format: { type: "string", defaultValue: "markdown" },
			tags: { type: "string", defaultValue: "[]" },
			status: { type: "string", defaultValue: "draft" },
			scheduledAt: { type: "date", required: false },
			// Frozen before dispatch; null identifies campaigns created before recovery support.
			audience: { type: "string", required: false },
			sentAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	send: {
		modelName: "newsletterSend",
		fields: {
			key: { type: "string", required: true, unique: true },
			campaignId: { type: "string", required: true },
			subscriberId: { type: "string", required: true },
			email: { type: "string", required: true },
			status: { type: "string", defaultValue: "pending" },
			trackingToken: { type: "string", required: true, unique: true },
			unsubscribeToken: { type: "string", required: true, unique: true },
			links: { type: "string", defaultValue: "[]" },
			messageId: { type: "string", required: false },
			attemptCount: { type: "number", defaultValue: 0 },
			attemptId: { type: "string", required: false },
			lastError: { type: "string", required: false },
			// The exact retry payload includes secret links and must never be serialized.
			html: { type: "string", required: false },
			sentAt: { type: "date", required: false },
			openedAt: { type: "date", required: false },
			clickedAt: { type: "date", required: false },
		},
	},
});
