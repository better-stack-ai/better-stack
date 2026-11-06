import { createDbPlugin } from "@btst/db";

/** Products remain CMS items; only commerce-specific records live here. */
export const ecommerceSchema = createDbPlugin("ecommerce", {
	ecommerceInventory: {
		modelName: "ecommerceInventory",
		fields: {
			key: { type: "string", required: true, unique: true },
			productId: { type: "string", required: true },
			variantId: { type: "string", required: false },
			stock: { type: "number", required: true },
		},
	},
	ecommerceOrder: {
		modelName: "ecommerceOrder",
		fields: {
			email: { type: "string", required: true },
			customerId: { type: "string", required: false },
			status: { type: "string", defaultValue: "pending" },
			lineItems: { type: "string", required: true },
			subtotal: { type: "number", required: true },
			discount: { type: "number", defaultValue: 0 },
			shipping: { type: "number", defaultValue: 0 },
			tax: { type: "number", defaultValue: 0 },
			total: { type: "number", required: true },
			currency: { type: "string", required: true },
			shippingAddress: { type: "string", required: true },
			paymentProvider: { type: "string", required: true },
			paymentRef: { type: "string", required: false },
			paymentStatus: { type: "string", defaultValue: "pending" },
			paidHookDelivered: { type: "boolean", defaultValue: false },
			paymentData: { type: "string", defaultValue: "{}" },
			accessToken: { type: "string", required: true },
			idempotencyKey: { type: "string", required: true, unique: true },
			checkoutFingerprint: { type: "string", required: true },
			discountCodeId: { type: "string", required: false },
			inventoryReleased: { type: "boolean", defaultValue: false },
			createdAt: { type: "date", defaultValue: () => new Date() },
			updatedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	ecommerceDiscountCode: {
		modelName: "ecommerceDiscountCode",
		fields: {
			code: { type: "string", required: true, unique: true },
			type: { type: "string", required: true },
			value: { type: "number", required: true },
			maxUses: { type: "number", required: false },
			uses: { type: "number", defaultValue: 0 },
			expiresAt: { type: "date", required: false },
		},
	},
});
