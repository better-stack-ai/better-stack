import { createDbPlugin } from "@btst/db";

export const affiliateSchema = createDbPlugin("affiliate", {
	affiliate: {
		modelName: "affiliate",
		fields: {
			userId: { type: "string", required: true, unique: true },
			name: { type: "string", required: true },
			email: { type: "string", required: true, unique: true },
			code: { type: "string", required: true, unique: true },
			status: { type: "string", required: true, defaultValue: "pending" },
			payoutDetails: { type: "string", required: false },
			notes: { type: "string", required: false },
			commissionType: { type: "string", required: false },
			commissionValue: { type: "number", required: false },
			lockVersion: { type: "string", defaultValue: () => crypto.randomUUID() },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	referralClick: {
		modelName: "referralClick",
		fields: {
			affiliateId: { type: "string", required: true },
			code: { type: "string", required: true },
			landingPath: { type: "string", required: false },
			referrer: { type: "string", required: false },
			ipHash: { type: "string", required: false },
			userAgent: { type: "string", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	conversion: {
		modelName: "affiliateConversion",
		fields: {
			affiliateId: { type: "string", required: true },
			clickId: { type: "string", required: false },
			externalRef: { type: "string", required: false, unique: true },
			amount: { type: "number", required: true },
			currency: { type: "string", required: true, defaultValue: "USD" },
			status: { type: "string", required: true, defaultValue: "pending" },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	commission: {
		modelName: "affiliateCommission",
		fields: {
			affiliateId: { type: "string", required: true },
			conversionId: { type: "string", required: true, unique: true },
			payoutId: { type: "string", required: true, defaultValue: "" },
			amount: { type: "number", required: true },
			currency: { type: "string", required: true, defaultValue: "USD" },
			status: { type: "string", required: true, defaultValue: "pending" },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	payout: {
		modelName: "affiliatePayout",
		fields: {
			affiliateId: { type: "string", required: true },
			amount: { type: "number", required: true },
			currency: { type: "string", required: true, defaultValue: "USD" },
			status: { type: "string", required: true, defaultValue: "pending" },
			reference: { type: "string", required: false },
			paidAt: { type: "date", required: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
