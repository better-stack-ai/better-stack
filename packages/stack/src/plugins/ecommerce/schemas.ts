import { z } from "zod";
import type { ContentTypeConfig } from "@btst/stack/plugins/cms/api";

const money = z.number().int().min(0).max(100_000_000);
export const productVariantSchema = z.object({
	id: z.string().min(1).max(100),
	name: z.string().trim().min(1).max(200),
	options: z.record(z.string().max(100), z.string().max(100)).default({}),
	price: money.optional(),
	stock: z.number().int().min(0).max(1_000_000).default(0).meta({
		title: "Initial stock",
		description:
			"Used only until commerce inventory is initialized. Restock through updateInventory with expectedStock.",
	}),
	sku: z.string().max(100).optional(),
});
/** Product data authored in CMS; all amounts are integer minor units. */
export const productSchema = z.object({
	name: z.string().trim().min(1).max(200),
	description: z
		.string()
		.max(100_000)
		.default("")
		.meta({ fieldType: "markdown" }),
	price: money,
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	stock: z.number().int().min(0).max(1_000_000).default(0).meta({
		title: "Initial stock",
		description:
			"Used only until commerce inventory is initialized. Restock through updateInventory with expectedStock.",
	}),
	images: z
		.array(z.string().min(1).max(2048))
		.max(20)
		.default([])
		.meta({ fieldType: "ecommerce-images" }),
	category: z.string().trim().max(100).optional(),
	collections: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
	tags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
	status: z
		.enum(["draft", "published", "archived"])
		.default("draft")
		.meta({ fieldType: "select" }),
	variants: z
		.array(productVariantSchema)
		.max(100)
		.default([])
		.refine(
			(variants) =>
				new Set(variants.map((variant) => variant.id)).size === variants.length,
			"Variant IDs must be unique",
		),
});
export const PRODUCT_TYPE_SLUG = "ecommerce-product" as const;
/** Register this alongside the Ecommerce backend plugin in CMS contentTypes. */
export const PRODUCT_CONTENT_TYPE: ContentTypeConfig = {
	name: "Product",
	slug: PRODUCT_TYPE_SLUG,
	description: "Storefront products and inventory",
	schema: productSchema,
};
export const ECOMMERCE_PRODUCT_CONTENT_TYPE = PRODUCT_CONTENT_TYPE;
const optionalText = z.string().trim().max(200).optional();
export const productsQuerySchema = z.object({
	category: optionalText,
	collection: optionalText,
	search: optionalText,
	minPrice: z.coerce.number().int().min(0).optional(),
	maxPrice: z.coerce.number().int().min(0).optional(),
	inStock: z.preprocess(
		(v) => (v === "true" ? true : v === "false" ? false : v),
		z.boolean().optional(),
	),
	limit: z.coerce.number().int().min(1).max(100).default(24),
	offset: z.coerce.number().int().min(0).default(0),
});
export const cartItemSchema = z.object({
	productId: z.string().min(1).max(200),
	variantId: z.string().min(1).max(100).optional(),
	quantity: z.number().int().min(1).max(100),
});
export const shippingAddressSchema = z.object({
	name: z.string().trim().min(1).max(200),
	line1: z.string().trim().min(1).max(200),
	line2: z.string().trim().max(200).optional(),
	city: z.string().trim().min(1).max(100),
	region: z.string().trim().max(100).optional(),
	postalCode: z.string().trim().min(1).max(30),
	country: z.string().regex(/^[A-Z]{2}$/),
});
export const checkoutSchema = z.object({
	items: z.array(cartItemSchema).min(1).max(50),
	email: z.email().max(254),
	shippingAddress: shippingAddressSchema,
	discountCode: z.string().trim().min(1).max(100).optional(),
	idempotencyKey: z.uuid(),
});
export const orderStatusSchema = z.enum([
	"pending",
	"paid",
	"fulfilling",
	"fulfilled",
	"cancelled",
]);
export const createDiscountSchema = z
	.object({
		code: z
			.string()
			.trim()
			.min(1)
			.max(100)
			.transform((v) => v.toUpperCase()),
		type: z.enum(["percent", "fixed"]),
		value: money,
		maxUses: z.number().int().positive().optional(),
		expiresAt: z.iso.datetime().optional(),
	})
	.refine(
		(v) => v.type !== "percent" || v.value <= 100,
		"Percent discount must be at most 100",
	);
export const ordersQuerySchema = z.object({
	status: orderStatusSchema.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
	offset: z.coerce.number().int().min(0).default(0),
});

/** Restocking requires the last observed available count to prevent lost updates. */
export const updateInventorySchema = z.object({
	productId: z.string().min(1).max(200),
	variantId: z.string().min(1).max(100).optional(),
	stock: z.number().int().min(0).max(1_000_000),
	expectedStock: z.number().int().min(0),
});
