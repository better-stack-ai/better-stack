import type { z } from "zod";
import type {
	productSchema,
	productVariantSchema,
	productsQuerySchema,
	shippingAddressSchema,
	checkoutSchema,
	orderStatusSchema,
	cartItemSchema,
} from "./schemas";

/** CMS product exposed by the storefront. */
export type Product = z.output<typeof productSchema> & {
	id: string;
	slug: string;
	createdAt: string;
	updatedAt: string;
};
export type ProductVariant = z.output<typeof productVariantSchema>;
export type ProductsFilters = z.input<typeof productsQuerySchema>;
export type ProductsPage = {
	items: Product[];
	total: number;
	limit: number;
	offset: number;
	categories: string[];
	collections: string[];
};
export type CartItem = z.output<typeof cartItemSchema>;
export type ShippingAddress = z.output<typeof shippingAddressSchema>;
export type CheckoutInput = z.input<typeof checkoutSchema>;
export type OrderStatus = z.output<typeof orderStatusSchema>;
export type OrderLineItem = {
	productId: string;
	variantId?: string;
	name: string;
	variantName?: string;
	quantity: number;
	price: number;
	image?: string;
};
/** Safe order representation; access tokens and idempotency keys are never listed. */
export type Order = {
	id: string;
	email: string;
	customerId?: string | null;
	status: OrderStatus;
	lineItems: OrderLineItem[];
	subtotal: number;
	discount: number;
	shipping: number;
	total: number;
	currency: string;
	shippingAddress: ShippingAddress;
	paymentProvider: string;
	paymentRef?: string | null;
	paymentStatus: "pending" | "paid" | "failed" | "refunded";
	createdAt: string;
	updatedAt: string;
};
export type OrdersPage = { items: Order[]; total: number };
export type OrderRecord = Omit<
	Order,
	"lineItems" | "shippingAddress" | "createdAt" | "updatedAt"
> & {
	lineItems: string;
	shippingAddress: string;
	createdAt: Date;
	updatedAt: Date;
	accessToken: string;
	idempotencyKey: string;
	checkoutFingerprint: string;
	paymentData: string;
	discountCodeId?: string | null;
	inventoryReleased: boolean;
	paidHookDelivered: boolean;
};
export type DiscountCode = {
	id: string;
	code: string;
	type: "percent" | "fixed";
	value: number;
	maxUses?: number | null;
	uses: number;
	expiresAt?: Date | null;
};
export type CheckoutResult = {
	orderId: string;
	accessToken: string;
	payment: { redirectUrl?: string; clientSecret?: string };
};
/** Serialized products and orders already carry ISO date strings. */
export type SerializedProduct = Product;
export type ProductListParams = ProductsFilters;
export type ProductListResult = ProductsPage;
export type SerializedOrder = Order;
export type CartLineInput = CartItem;
export type DiscountResult = {
	code: string;
	discount: number;
	subtotal: number;
	total: number;
	currency: string;
};

/** Authoritative remaining stock after initialization from the CMS product. */
export type InventoryRecord = {
	id: string;
	key: string;
	productId: string;
	variantId?: string | null;
	stock: number;
};
