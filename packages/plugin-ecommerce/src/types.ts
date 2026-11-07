import type { z } from "zod";
import type {
	productSchema,
	productVariantSchema,
	productsQuerySchema,
	shippingAddressSchema,
	checkoutSchema,
	checkoutQuoteSchema,
	createDiscountSchema,
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
/** Address and cart details used for a non-reserving checkout preview. */
export type CheckoutQuoteInput = z.input<typeof checkoutQuoteSchema>;
/** Server-calculated amounts in integer currency minor units. */
export type CheckoutQuote = {
	subtotal: number;
	discount: number;
	shipping: number;
	tax: number;
	total: number;
	currency: string;
};
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
	tax: number;
	total: number;
	currency: string;
	shippingAddress: ShippingAddress;
	paymentProvider: string;
	paymentRef?: string | null;
	paymentStatus: "pending" | "paid" | "failed" | "refunded";
	createdAt: string;
	updatedAt: string;
	deliveryGrants?: DigitalGrant[];
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
	paymentVerified?: boolean;
	deliveryGuestTokenHash?: string | null;
	deliveryGuestExpiresAt?: Date | null;
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
/** Discount code returned by administrative operations, with an ISO expiry. */
export type SerializedDiscountCode = Omit<DiscountCode, "expiresAt"> & {
	expiresAt: string | null;
};
/** Administrative discount creation input; fixed values use minor units. */
export type CreateDiscountInput = z.input<typeof createDiscountSchema>;
/** Paginated discount administration results. */
export type DiscountCodesPage = {
	items: SerializedDiscountCode[];
	total: number;
};
export type CheckoutResult = {
	orderId: string;
	accessToken: string;
	/** Persisted order amounts, reused unchanged on idempotent retries. */
	quote: CheckoutQuote;
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

/** One persisted full-order refund identity, including its state transitions. */
export type RefundAttempt = {
	id: string;
	orderId: string;
	status: "pending" | "confirmed" | "failed" | "uncertain";
	amount: number;
	currency: string;
	refundRef?: string | null;
	history: { status: RefundAttempt["status"]; createdAt: string }[];
	createdAt: string;
	updatedAt: string;
};
export type OrderRefund = {
	supported: boolean;
	eligible: boolean;
	unavailableReason?: string;
	amount: number;
	currency: string;
	attempt: RefundAttempt | null;
};
export type RefundRecord = Omit<
	RefundAttempt,
	"history" | "createdAt" | "updatedAt"
> & {
	idempotencyKey: string;
	paymentRef: string;
	paymentProvider: string;
	history: string;
	createdAt: Date;
	updatedAt: Date;
};

/** Purchaser-safe delivery state; source resources and guest credentials stay private. */
export type DigitalGrant = {
	id: string;
	orderId: string;
	itemIndex: number;
	name: string;
	quantity: number;
	adapter: string;
	status:
		| "pending"
		| "processing"
		| "active"
		| "failed"
		| "revoking"
		| "revoked";
	expiresAt: string | null;
	downloadable: boolean;
	lastError: string | null;
};
/** Durable private delivery snapshot and worker claim; never return this record to a browser. */
export type DigitalGrantRecord = Omit<
	DigitalGrant,
	"expiresAt" | "downloadable"
> & {
	key: string;
	resourceId: string;
	expiresInSeconds: number | null;
	expiresAt: Date | null;
	leaseUntil: Date | null;
	attempt: string | null;
};
