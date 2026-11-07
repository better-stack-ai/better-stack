import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	OperationHttpError,
	type DeepReadonly,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { ecommercePermissions as permissions } from "../permissions";
import {
	checkoutSchema,
	checkoutQuoteSchema,
	discountCodesQuerySchema,
	createDiscountSchema,
	orderStatusSchema,
	ordersQuerySchema,
	productSchema,
	productsQuerySchema,
	cartItemSchema,
	updateInventorySchema,
} from "../schemas";
import type {
	CheckoutResult,
	DiscountCode,
	DiscountResult,
	Order,
	OrderLineItem,
	OrderRecord,
	Product,
	InventoryRecord,
	CheckoutQuote,
	ShippingAddress,
	CartItem,
} from "../types";
import {
	getDiscountCode,
	getOrder,
	listOrders,
	listProducts,
	getProduct,
	getInventory,
	listDiscountCodes,
} from "./getters";
import {
	createProduct,
	ecommerceError as fail,
	productSnapshot,
	releaseInventory,
	requireAtomicTransactions,
	reserveInventory,
	initializeInventory,
} from "./mutations";
import type { PaymentAdapter, PaymentWebhookResult } from "./payment-adapter";
import { serializeOrder } from "./serializers";
import { orderRefunds, confirmOrderRefund } from "./refunds";

/** Authorized checkout and payment lifecycle events. */
export interface EcommerceBackendHooks {
	/** Capture trusted referral attribution once from the initial browser checkout request. Stored privately for verified payment hooks. */
	capturePaymentAttribution?: (context: {
		request?: Request;
	}) =>
		| { code?: string; clickId?: string }
		| undefined
		| Promise<{ code?: string; clickId?: string } | undefined>;

	onBeforeCreateOrder?: (
		input: DeepReadonly<z.output<typeof checkoutSchema>>,
		context: { request?: Request },
	) => void | Promise<void>;
	/** Retried on verified paid webhooks until successful. Make fulfillment idempotent by order.id. */
	onAfterOrderPaid?: (
		order: DeepReadonly<Order>,
		context: {
			request?: Request;
			attribution?: { code?: string; clickId?: string };
		},
	) => void | Promise<void>;
}
/** Authoritative product prices and address supplied to quote calculators. */
export interface CheckoutCalculationContext {
	lineItems: readonly Readonly<OrderLineItem>[];
	shippingAddress: Readonly<ShippingAddress>;
	subtotal: number;
	discount: number;
	currency: string;
}
/** Commerce configuration; CMS must register PRODUCT_CONTENT_TYPE. */
export interface EcommerceBackendConfig {
	/** Provider implementation; raw webhook signatures must be verified by the adapter. */
	paymentAdapter: PaymentAdapter;
	/** Store currency, shared by every product and checkout. @default USD */
	currency?: string;
	/** Flat shipping charge in currency minor units. @default 0 */
	shippingAmount?: number;
	/** Live shipping in integer minor units; overrides shippingAmount. Called for preview and order creation. */
	calculateShipping?: (
		context: CheckoutCalculationContext,
	) => number | Promise<number>;
	/** Live tax in integer minor units, after discount and shipping. Defaults to zero. */
	calculateTax?: (
		context: CheckoutCalculationContext & { shipping: number },
	) => number | Promise<number>;
	/** Post-authorization business callbacks. */
	hooks?: EcommerceBackendHooks;
}
const idSchema = z.object({ id: z.string().min(1).max(200) });
export const discountValidationSchema = z.object({
	code: z.string().trim().min(1).max(100),
	items: z.array(cartItemSchema).min(1).max(50),
});
const paymentSchema = z
	.object({
		clientSecret: z.string().min(1).optional(),
		redirectUrl: z
			.string()
			.refine(
				(url) =>
					/^https?:\/\//.test(url) ||
					(url.startsWith("/") && !url.startsWith("//")),
				"Payment URL must use HTTP(S) or a local path",
			)
			.optional(),
	})
	.refine(
		(result) => result.clientSecret || result.redirectUrl,
		"Payment provider returned no payment destination",
	);
function customerId(identity: unknown): string | undefined {
	return identity &&
		typeof identity === "object" &&
		"id" in identity &&
		typeof identity.id === "string"
		? identity.id
		: undefined;
}
function discountAmount(discount: DiscountCode, subtotal: number) {
	if (
		(discount.expiresAt &&
			new Date(discount.expiresAt).getTime() <= Date.now()) ||
		(discount.maxUses != null && discount.uses >= discount.maxUses)
	)
		fail(400, "Discount code has expired or reached its usage limit");
	return Math.min(
		subtotal,
		discount.type === "percent"
			? Math.floor((subtotal * discount.value) / 100)
			: discount.value,
	);
}
async function sha256(value: string) {
	return Array.from(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
		),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
}
function safeProduct(
	item: { id: string; slug: string; createdAt: string; updatedAt: string },
	data: z.output<typeof productSchema>,
): Product {
	return {
		...data,
		id: item.id,
		slug: item.slug,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
	};
}

/** The single validated operation inventory shared by HTTP and server jobs. */
export function createEcommerceOperations(
	adapter: Adapter,
	config: EcommerceBackendConfig,
	mediaAvailable = false,
) {
	const refunds = orderRefunds(adapter, config.paymentAdapter);
	const currency = config.currency ?? "USD";
	const shipping = config.shippingAmount ?? 0;
	async function calculateTotals(
		lineItems: OrderLineItem[],
		shippingAddress: ShippingAddress,
		discount: number,
	): Promise<CheckoutQuote> {
		const subtotal = lineItems.reduce(
			(sum, line) => sum + line.quantity * line.price,
			0,
		);
		const context: CheckoutCalculationContext = Object.freeze({
			lineItems: Object.freeze(
				lineItems.map((line) => Object.freeze({ ...line })),
			),
			shippingAddress: Object.freeze({ ...shippingAddress }),
			subtotal,
			discount,
			currency,
		});
		const quotedShipping = config.calculateShipping
			? await config.calculateShipping(context)
			: shipping;
		const tax = config.calculateTax
			? await config.calculateTax(
					Object.freeze({ ...context, shipping: quotedShipping }),
				)
			: 0;
		for (const [name, amount] of [
			["shipping", quotedShipping],
			["tax", tax],
		] as const)
			if (!Number.isSafeInteger(amount) || amount < 0)
				fail(
					500,
					`Invalid ${name} calculation: expected non-negative integer minor units`,
				);
		const total = subtotal - discount + quotedShipping + tax;
		if (!Number.isSafeInteger(total))
			fail(500, "Checkout total exceeds safe integer range");
		return {
			subtotal,
			discount,
			shipping: quotedShipping,
			tax,
			total,
			currency,
		};
	}
	async function cartLines(items: readonly Readonly<CartItem>[]) {
		const lines: OrderLineItem[] = [];
		const quantities = new Map<string, number>();
		for (const line of items) {
			const { data } = await productSnapshot(adapter, line.productId);
			if (data.currency !== currency)
				fail(400, "Cart currency does not match the store");
			const variant = line.variantId
				? data.variants.find((item) => item.id === line.variantId)
				: undefined;
			if ((data.variants.length && !variant) || (line.variantId && !variant))
				fail(400, "Choose a valid product variant");
			const key = JSON.stringify([line.productId, line.variantId ?? null]);
			const quantity = (quantities.get(key) ?? 0) + line.quantity;
			quantities.set(key, quantity);
			const inventory = await getInventory(
				adapter,
				line.productId,
				line.variantId,
			);
			if ((inventory?.stock ?? variant?.stock ?? data.stock) < quantity)
				fail(409, "Cart has insufficient stock");
			lines.push({
				...line,
				name: data.name,
				...(variant ? { variantName: variant.name } : {}),
				price: variant?.price ?? data.price,
			});
		}
		return lines;
	}
	async function checkoutResult(order: OrderRecord): Promise<CheckoutResult> {
		if (order.status !== "pending")
			fail(409, "This checkout is no longer pending");
		let payment = JSON.parse(order.paymentData) as {
			clientSecret?: string;
			redirectUrl?: string;
			attribution?: { code?: string; clickId?: string };
			initializing?: boolean;
		};
		if (!payment.clientSecret && !payment.redirectUrl) {
			if (payment.initializing)
				fail(
					409,
					"Payment is initializing or needs administrator reconciliation; do not start another payment",
				);
			const initializing = JSON.stringify({ ...payment, initializing: true });
			const claimed = await adapter.update({
				model: "ecommerceOrder",
				where: [
					{ field: "id", value: order.id },
					{ field: "status", value: "pending" },
					{ field: "paymentData", value: order.paymentData },
				],
				update: { paymentData: initializing, updatedAt: new Date() },
			});
			if (!claimed)
				fail(
					409,
					"Payment is initializing or needs administrator reconciliation; do not start another payment",
				);
			// An ambiguous provider failure retains the claim: creating a second session could charge twice.
			payment = {
				...paymentSchema.parse(
					await config.paymentAdapter.createPayment({
						amount: order.total,
						currency: order.currency,
						orderId: order.id,
						metadata: { email: order.email },
					}),
				),
				attribution: payment.attribution,
			};
			await adapter.update({
				model: "ecommerceOrder",
				where: [
					{ field: "id", value: order.id },
					{ field: "paymentData", value: initializing },
				],
				update: { paymentData: JSON.stringify(payment), updatedAt: new Date() },
			});
		}
		return {
			orderId: order.id,
			accessToken: order.accessToken,
			payment: {
				clientSecret: payment.clientSecret,
				redirectUrl: payment.redirectUrl,
			},
			quote: {
				subtotal: order.subtotal,
				discount: order.discount,
				shipping: order.shipping,
				tax: order.tax ?? 0,
				total: order.total,
				currency: order.currency,
			},
		};
	}

	return {
		listProducts: defineOperation({
			input: productsQuerySchema,
			permission: permissions.product.read,
			facts: () => ({}),
			execute: ({ input }) => listProducts(adapter, input, mediaAvailable),
		}),
		getProduct: defineOperation({
			input: z.object({ slug: z.string().min(1).max(200) }),
			permission: permissions.product.read,
			facts: ({ input }) => ({ slug: input.slug }),
			execute: async ({ input }) =>
				(await getProduct(adapter, input.slug, mediaAvailable)) ??
				fail(404, "Product not found"),
		}),
		createProduct: defineOperation({
			input: z.object({
				slug: z
					.string()
					.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
					.max(200),
				data: productSchema,
			}),
			permission: permissions.product.manage,
			facts: () => ({}),
			execute: async ({ input }) => {
				const data = productSchema.parse(input.data);
				const item = await createProduct(adapter, input.slug, data);
				return safeProduct(item, data);
			},
		}),
		updateInventory: defineOperation({
			input: updateInventorySchema,
			permission: permissions.product.manage,
			facts: ({ input }) => ({ id: input.productId }),
			execute: async ({ input }) => {
				requireAtomicTransactions(adapter);
				const inventory = await initializeInventory(
					adapter,
					input.productId,
					input.variantId,
				);
				return adapter.transaction(async (tx) => {
					await productSnapshot(tx, input.productId);
					const updated = await tx.update<InventoryRecord>({
						model: "ecommerceInventory",
						where: [
							{ field: "id", value: inventory.id },
							{ field: "stock", value: input.expectedStock },
						],
						update: { stock: input.stock },
					});
					return (
						updated ?? fail(409, "Inventory changed; reload before restocking")
					);
				});
			},
		}),
		listDiscountCodes: defineOperation({
			input: discountCodesQuerySchema,
			permission: permissions.discount.manage,
			facts: () => ({}),
			execute: async ({ input }) => {
				const page = await listDiscountCodes(adapter, input);
				return {
					...page,
					items: page.items.map((record) => ({
						...record,
						expiresAt: record.expiresAt
							? new Date(record.expiresAt).toISOString()
							: null,
					})),
				};
			},
		}),
		deleteDiscountCode: defineOperation({
			input: idSchema,
			permission: permissions.discount.manage,
			facts: () => ({}),
			execute: async ({ input }) => {
				const record = await adapter.findOne<DiscountCode>({
					model: "ecommerceDiscountCode",
					where: [{ field: "id", value: input.id }],
				});
				if (!record) fail(404, "Discount code not found");
				await adapter.delete({
					model: "ecommerceDiscountCode",
					where: [{ field: "id", value: input.id }],
				});
				return { success: true };
			},
		}),
		createDiscountCode: defineOperation({
			input: createDiscountSchema,
			permission: permissions.discount.manage,
			facts: () => ({}),
			execute: async ({ input }) => {
				if (await getDiscountCode(adapter, input.code))
					fail(409, "Discount code already exists");
				const record = await adapter.create<DiscountCode>({
					model: "ecommerceDiscountCode",
					data: {
						...input,
						uses: 0,
						expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					},
				});
				return {
					...record,
					expiresAt: record.expiresAt
						? new Date(record.expiresAt).toISOString()
						: null,
				};
			},
		}),
		validateDiscountCode: defineOperation({
			input: discountValidationSchema,
			permission: permissions.discount.validate,
			facts: () => ({}),
			execute: async ({ input }): Promise<DiscountResult> => {
				const lineItems = await cartLines(input.items);
				const subtotal = lineItems.reduce(
					(sum, line) => sum + line.price * line.quantity,
					0,
				);
				const record = await getDiscountCode(adapter, input.code);
				if (!record) fail(400, "Discount code not found");
				const discount = discountAmount(record, subtotal);
				return {
					code: record.code,
					subtotal,
					discount,
					total: subtotal - discount + shipping,
					currency,
				};
			},
		}),
		previewCheckout: defineOperation({
			input: checkoutQuoteSchema,
			permission: permissions.checkout.create,
			facts: () => ({}),
			execute: async ({ input }): Promise<CheckoutQuote> => {
				const lineItems = await cartLines(input.items);
				const subtotal = lineItems.reduce(
					(sum, line) => sum + line.price * line.quantity,
					0,
				);
				let discount = 0;
				if (input.discountCode) {
					const record = await getDiscountCode(adapter, input.discountCode);
					if (!record) fail(400, "Discount code not found");
					discount = discountAmount(record, subtotal);
				}
				return calculateTotals(lineItems, input.shippingAddress, discount);
			},
		}),
		createCheckout: defineOperation({
			input: checkoutSchema,
			permission: permissions.checkout.create,
			facts: () => ({}),
			execute: async ({
				input,
				identity,
				request,
			}): Promise<CheckoutResult> => {
				requireAtomicTransactions(adapter);
				const parsed = checkoutSchema.parse(input);
				const owner = customerId(identity);
				const fingerprint = await sha256(
					JSON.stringify({ ...parsed, customerId: owner ?? null }),
				);
				const previous = await adapter.findOne<OrderRecord>({
					model: "ecommerceOrder",
					where: [{ field: "idempotencyKey", value: parsed.idempotencyKey }],
				});
				if (previous) {
					if (previous.checkoutFingerprint !== fingerprint)
						fail(409, "Checkout key was already used for different details");
					return checkoutResult(previous);
				}
				await config.hooks?.onBeforeCreateOrder?.(input, { request });
				const attribution = await config.hooks?.capturePaymentAttribution?.({
					request,
				});
				let existingCheckoutObserved = false;
				let orderWriteStarted = false;
				let order: OrderRecord;
				try {
					for (const line of parsed.items)
						await initializeInventory(adapter, line.productId, line.variantId);
					order = await adapter.transaction(async (tx) => {
						const existing = await tx.findOne<OrderRecord>({
							model: "ecommerceOrder",
							where: [
								{ field: "idempotencyKey", value: parsed.idempotencyKey },
							],
						});
						if (existing) {
							existingCheckoutObserved = true;
							if (existing.checkoutFingerprint !== fingerprint)
								fail(
									409,
									"Checkout key was already used for different details",
								);
							return existing;
						}
						const lineItems = await reserveInventory(
							tx,
							parsed.items,
							currency,
							mediaAvailable,
						);
						const subtotal = lineItems.reduce(
							(sum, line) => sum + line.quantity * line.price,
							0,
						);
						let discount = 0;
						let discountCodeId: string | undefined;
						if (parsed.discountCode) {
							const record = await tx.findOne<DiscountCode>({
								model: "ecommerceDiscountCode",
								where: [
									{ field: "code", value: parsed.discountCode.toUpperCase() },
								],
							});
							if (!record) fail(400, "Discount code not found");
							discount = discountAmount(record, subtotal);
							const claimed = await tx.update({
								model: "ecommerceDiscountCode",
								where: [
									{ field: "id", value: record.id },
									{ field: "uses", value: record.uses },
								],
								update: { uses: record.uses + 1 },
							});
							if (!claimed) fail(409, "Discount usage changed; retry checkout");
							discountCodeId = record.id;
						}
						const totals = await calculateTotals(
							lineItems,
							parsed.shippingAddress,
							discount,
						);
						const rejection = config.paymentAdapter.validatePayment?.({
							amount: totals.total,
							currency,
						});
						if (rejection) fail(400, rejection);
						orderWriteStarted = true;
						return tx.create<OrderRecord>({
							model: "ecommerceOrder",
							data: {
								email: parsed.email,
								customerId: owner ?? null,
								status: "pending",
								lineItems: JSON.stringify(lineItems),
								...totals,
								shippingAddress: JSON.stringify(parsed.shippingAddress),
								paymentProvider: config.paymentAdapter.name ?? "custom",
								paymentStatus: "pending",
								paidHookDelivered: false,
								paymentData: JSON.stringify({ attribution }),
								accessToken: crypto.randomUUID(),
								idempotencyKey: parsed.idempotencyKey,
								checkoutFingerprint: fingerprint,
								discountCodeId: discountCodeId ?? null,
								inventoryReleased: false,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});
					});
				} catch (error) {
					if (
						!existingCheckoutObserved &&
						!orderWriteStarted &&
						error instanceof OperationHttpError &&
						error.code === "ECOMMERCE_ERROR" &&
						[400, 404, 409].includes(error.statusCode)
					) {
						throw new OperationHttpError(
							error.statusCode,
							error.message,
							"CHECKOUT_NOT_CREATED",
							error.issues,
						);
					}
					throw error;
				}
				return checkoutResult(order);
			},
		}),
		listOrders: defineOperation({
			input: ordersQuerySchema,
			permission: permissions.order.read,
			facts: () => ({}),
			execute: async ({ input }) => {
				const page = await listOrders(adapter, input);
				return { ...page, items: page.items.map(serializeOrder) };
			},
		}),
		getOrder: defineOperation({
			input: idSchema,
			permission: permissions.order.read,
			facts: ({ input }) => ({ id: input.id }),
			execute: async ({ input }) =>
				serializeOrder(
					(await getOrder(adapter, input.id)) ?? fail(404, "Order not found"),
				),
		}),
		listMyOrders: defineOperation({
			input: ordersQuerySchema,
			permission: permissions.order.own,
			facts: () => ({ customerId: "self" }),
			execute: async ({ input, identity }) => {
				const id = customerId(identity);
				if (!id) fail(401, "Sign in to view your orders");
				const page = await listOrders(adapter, { ...input, customerId: id });
				return { ...page, items: page.items.map(serializeOrder) };
			},
		}),
		getOrderConfirmation: defineOperation({
			input: idSchema.extend({ token: z.string().max(200) }),
			permission: permissions.order.confirmation,
			facts: ({ input }) => ({ id: input.id }),
			execute: async ({ input }) => {
				const order = await getOrder(adapter, input.id);
				if (!order || order.accessToken !== input.token)
					fail(404, "Order not found");
				return serializeOrder(order);
			},
		}),
		getOrderRefund: defineOperation({
			input: idSchema,
			permission: permissions.order.readRefund,
			facts: ({ input }) => ({ id: input.id }),
			execute: ({ input }) => refunds.overview(input.id),
		}),
		refundOrder: defineOperation({
			input: idSchema.extend({ confirm: z.literal(true) }).strict(),
			permission: permissions.order.refund,
			facts: ({ input }) => ({ id: input.id }),
			execute: ({ input }) => refunds.initiate(input.id),
		}),
		reconcileOrderRefund: defineOperation({
			input: idSchema,
			permission: permissions.order.reconcileRefund,
			facts: ({ input }) => ({ id: input.id }),
			execute: ({ input }) => refunds.reconcile(input.id),
		}),
		updateOrderStatus: defineOperation({
			input: idSchema.extend({ status: orderStatusSchema }),
			permission: permissions.order.update,
			facts: ({ input }) => ({ id: input.id }),
			execute: async ({ input }) => {
				requireAtomicTransactions(adapter);
				return adapter.transaction(async (tx) => {
					const order = await tx.findOne<OrderRecord>({
						model: "ecommerceOrder",
						where: [{ field: "id", value: input.id }],
					});
					if (!order) fail(404, "Order not found");
					const next: Record<string, string[]> = {
						pending: ["cancelled"],
						paid: ["fulfilling", "cancelled"],
						fulfilling: ["fulfilled", "cancelled"],
						fulfilled: [],
						cancelled: [],
					};
					if (order.status === input.status) return serializeOrder(order);
					if (!next[order.status]?.includes(input.status))
						fail(409, "Invalid order status transition");
					const updated = await tx.update<OrderRecord>({
						model: "ecommerceOrder",
						where: [
							{ field: "id", value: order.id },
							{ field: "status", value: order.status },
							{ field: "updatedAt", value: order.updatedAt },
						],
						update: {
							status: input.status,
							inventoryReleased:
								input.status === "cancelled" ? true : order.inventoryReleased,
							updatedAt: new Date(
								Math.max(Date.now(), new Date(order.updatedAt).getTime() + 1),
							),
						},
					});
					if (!updated) fail(409, "Order changed; reload and retry");
					if (input.status === "cancelled" && !order.inventoryReleased) {
						await releaseInventory(tx, JSON.parse(order.lineItems));
						if (order.paymentStatus === "pending" && order.discountCodeId)
							await tx.incrementOne({
								model: "ecommerceDiscountCode",
								where: [
									{ field: "id", value: order.discountCodeId },
									{ field: "uses", value: 0, operator: "gt" },
								],
								increment: { uses: -1 },
							});
					}
					return serializeOrder(updated);
				});
			},
		}),
		handleWebhook: defineOperation({
			input: z.object({}),
			permission: permissions.checkout.webhook,
			access: "public",
			facts: () => ({}),
			execute: async ({ request }) => {
				if (!request) fail(400, "Webhook requires the original HTTP request");
				let event: PaymentWebhookResult | null;
				try {
					event = await config.paymentAdapter.handleWebhook(request);
				} catch {
					fail(400, "Invalid payment webhook");
				}
				if (!event) return { received: true };
				const parsed = z
					.object({
						orderId: z.string().min(1),
						status: z.enum(["paid", "failed", "refunded"]),
						paymentRef: z.string().min(1),
						amount: z.number().int().min(0),
						currency: z.string().regex(/^[A-Za-z]{3}$/),
					})
					.parse(event);
				requireAtomicTransactions(adapter);
				const paid = await adapter.transaction(async (tx) => {
					const order = await tx.findOne<OrderRecord>({
						model: "ecommerceOrder",
						where: [{ field: "id", value: parsed.orderId }],
					});
					if (!order) fail(404, "Order not found");
					if (
						order.paymentProvider !==
							(config.paymentAdapter.name ?? "custom") ||
						order.total !== parsed.amount ||
						order.currency.toUpperCase() !== parsed.currency.toUpperCase()
					)
						fail(400, "Payment does not match the order");
					if (order.paymentRef && order.paymentRef !== parsed.paymentRef)
						fail(409, "Payment reference does not match the order");
					if (parsed.status === "refunded") {
						await confirmOrderRefund(tx, {
							...order,
							paymentRef: parsed.paymentRef,
						});
						return null;
					}
					// Financial confirmation wins over delayed paid/failed events.
					if (order.paymentStatus === "refunded") return null;
					if (order.paymentStatus === parsed.status)
						return parsed.status === "paid" && !order.paidHookDelivered
							? order
							: null;
					if (parsed.status === "paid" && order.status !== "pending")
						fail(409, "Order is not awaiting payment");
					if (parsed.status === "failed" && order.paymentStatus !== "pending")
						return null;
					const status = parsed.status === "paid" ? "paid" : "cancelled";
					const updated = await tx.update<OrderRecord>({
						model: "ecommerceOrder",
						where: [
							{ field: "id", value: order.id },
							{ field: "paymentStatus", value: order.paymentStatus },
							{ field: "updatedAt", value: order.updatedAt },
						],
						update: {
							status,
							paymentStatus: parsed.status,
							paymentRef: parsed.paymentRef,
							inventoryReleased:
								status === "cancelled" ? true : order.inventoryReleased,
							updatedAt: new Date(
								Math.max(Date.now(), new Date(order.updatedAt).getTime() + 1),
							),
						},
					});
					if (!updated) fail(409, "Order changed; retry webhook");
					if (status === "cancelled" && !order.inventoryReleased) {
						await releaseInventory(
							tx,
							JSON.parse(order.lineItems) as OrderLineItem[],
						);
						if (order.paymentStatus === "pending" && order.discountCodeId)
							await tx.incrementOne({
								model: "ecommerceDiscountCode",
								where: [
									{ field: "id", value: order.discountCodeId },
									{ field: "uses", value: 0, operator: "gt" },
								],
								increment: { uses: -1 },
							});
					}
					return parsed.status === "paid" ? updated : null;
				});
				if (paid) {
					await config.hooks?.onAfterOrderPaid?.(serializeOrder(paid), {
						request,
						attribution: JSON.parse(paid.paymentData).attribution,
					});
					await adapter.update({
						model: "ecommerceOrder",
						where: [
							{ field: "id", value: paid.id },
							{ field: "paymentRef", value: parsed.paymentRef },
							{ field: "paymentStatus", value: "paid" },
						],
						update: { paidHookDelivered: true },
					});
				}
				return { received: true };
			},
		}),
	};
}
