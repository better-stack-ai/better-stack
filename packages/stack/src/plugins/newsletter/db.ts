import { createDbPlugin } from "@btst/db";

/** Isolated newsletter tables; tokens are stored as SHA-256 digests. */
export const newsletterSchema = createDbPlugin("newsletter", {
	subscriber: {
		modelName: "newsletterSubscriber",
		fields: {
			email: { type: "string", required: true, unique: true },
			name: { type: "string", required: false },
			status: { type: "string", defaultValue: "subscribed" },
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
			fromName: { type: "string", required: true },
			fromEmail: { type: "string", required: true },
			replyTo: { type: "string", required: false },
			body: { type: "string", required: true },
			format: { type: "string", defaultValue: "markdown" },
			tags: { type: "string", defaultValue: "[]" },
			status: { type: "string", defaultValue: "draft" },
			scheduledAt: { type: "date", required: false },
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
			status: { type: "string", defaultValue: "pending" },
			trackingToken: { type: "string", required: true, unique: true },
			unsubscribeToken: { type: "string", required: true, unique: true },
			links: { type: "string", defaultValue: "[]" },
			messageId: { type: "string", required: false },
			sentAt: { type: "date", required: false },
			openedAt: { type: "date", required: false },
			clickedAt: { type: "date", required: false },
		},
	},
});
