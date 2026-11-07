import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient } from "@btst/stack/plugins/client";
import { createEcommerceQueryKeys } from "../query-keys";
import type { EcommerceApiRouter } from "../api";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { mediaBackendPlugin } from "@btst/plugin-media/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import {
	ecommerceBackendPlugin,
	PRODUCT_CONTENT_TYPE,
	ECOMMERCE_QUERY_KEYS,
	stripeAdapter,
	lemonSqueezyAdapter,
} from "../api";
import type { EcommerceBackendConfig } from "../api/operations";
import type { PaymentAdapter } from "../api/payment-adapter";
import { ecommercePermissions } from "../permissions";
import { productSchema, PRODUCT_TYPE_SLUG } from "../schemas";
import type { CheckoutInput, Product } from "../types";

function serializedMemory(db: DatabaseDefinition): DBAdapter {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function lock<T>(run: () => Promise<T>): Promise<T> {
		const previous = tail;
		let release = () => {};
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	}
	return {
		...adapter,
		id: "serialized-test-memory",
		create: ((input) =>
			lock(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			lock(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			lock(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => lock(() => adapter.count(input)),
		update: ((input) =>
			lock(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => lock(() => adapter.updateMany(input)),
		delete: ((input) =>
			lock(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => lock(() => adapter.deleteMany(input)),
		transaction: ((callback) =>
			lock(() => adapter.transaction(callback))) as DBAdapter["transaction"],
	};
}
const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.string() }),
	permissions: [cmsPermissions, ecommercePermissions],
	rules: ({ ecommerce, cms }) => [
		cms.contentType.read.when(({ identity }) => identity?.role === "admin"),
		cms.record.update.when(({ identity }) => identity?.role === "admin"),
		ecommerce.product.read.allow(),
		ecommerce.checkout.create.allow(),
		ecommerce.discount.validate.allow(),
		ecommerce.order.confirmation.allow(),
		ecommerce.product.manage.when(({ identity }) => identity?.role === "admin"),
		ecommerce.discount.manage.when(
			({ identity }) => identity?.role === "admin",
		),
		ecommerce.order.read.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.update.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.readRefund.when(
			({ identity }) => identity?.role === "admin",
		),
		ecommerce.order.refund.when(({ identity }) => identity?.role === "admin"),
		ecommerce.order.reconcileRefund.when(
			({ identity }) => identity?.role === "admin",
		),
		ecommerce.order.own.when(({ identity }) => identity !== null),
	],
});
const demoAdapter: PaymentAdapter = {
	name: "demo",
	createPayment: vi.fn(async () => ({
		redirectUrl: "https://payments.example/checkout",
	})),
	handleWebhook: async (request) => {
		if (request.headers.get("x-demo-secret") !== "test-secret")
			throw new Error("Invalid signature");
		return request.json();
	},
};
async function setup(
	config: Partial<EcommerceBackendConfig> = {},
	atomic = true,
) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => {
			adapter = atomic ? serializedMemory(db) : createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-user");
				return id ? { id, role: id === "admin" ? "admin" : "user" } : null;
			},
		}),
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [PRODUCT_CONTENT_TYPE] }),
			ecommerce: ecommerceBackendPlugin({
				paymentAdapter: {
					...demoAdapter,
					createPayment: vi.fn(async () => ({
						redirectUrl: "https://payments.example/checkout",
					})),
				},
				...config,
			}),
		},
	});
	return { stack, adapter, ops: stack.trusted.ecommerce };
}
function req(
	path: string,
	method = "GET",
	body?: unknown,
	user?: string,
	headers: Record<string, string> = {},
) {
	return new Request(`https://test.local/api/shop/${path}`, {
		method,
		headers: {
			"content-type": "application/json",
			...(user ? { "x-user": user } : {}),
			...headers,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}
const address = {
	name: "Alex Buyer",
	line1: "12 Pine St",
	city: "Boston",
	region: "MA",
	postalCode: "02108",
	country: "US",
};
function checkout(
	product: Pick<Product, "id">,
	extra: Partial<CheckoutInput> = {},
): CheckoutInput {
	return {
		items: [{ productId: product.id, quantity: 1 }],
		email: "buyer@example.com",
		shippingAddress: address,
		idempotencyKey: crypto.randomUUID(),
		...extra,
	};
}
async function product(
	ops: Awaited<ReturnType<typeof setup>>["ops"],
	data = {},
) {
	return ops.createProduct({
		slug: `notebook-${crypto.randomUUID()}`,
		data: {
			name: "Field notebook",
			price: 1800,
			stock: 10,
			status: "published",
			category: "Stationery",
			...data,
		},
	});
}

describe("checkout quotes and discount administration", () => {
	it("rolls back reservations when a rate service fails without using the static fallback", async () => {
		const { ops, adapter } = await setup({
			shippingAmount: 300,
			calculateShipping: async () => {
				throw new Error("Rate service unavailable");
			},
		});
		const item = await product(ops);
		await ops.createDiscountCode({
			code: "RATE",
			type: "fixed",
			value: 100,
			maxUses: 1,
		});
		const input = checkout(item, { discountCode: "RATE" });
		await expect(ops.previewCheckout(input)).rejects.toThrow(
			"Rate service unavailable",
		);
		await expect(ops.createCheckout(input)).rejects.toThrow(
			"Rate service unavailable",
		);
		expect(await adapter.count({ model: "ecommerceOrder" })).toBe(0);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(10);
		expect((await ops.listDiscountCodes({})).items[0]?.uses).toBe(0);
	});
	it("previews without reservations, recalculates at creation, and retries persisted totals", async () => {
		let shipping = 300;
		const calculateShipping = vi.fn(async () => shipping);
		const calculateTax = vi.fn(
			async ({
				subtotal,
				discount,
				shipping,
			}: {
				subtotal: number;
				discount: number;
				shipping: number;
			}) => Math.floor((subtotal - discount + shipping) / 10),
		);
		const { ops, adapter, stack } = await setup({
			calculateShipping,
			calculateTax,
			shippingAmount: 999,
		});
		const item = await product(ops, {
			variants: [{ id: "large", name: "Large", price: 2100, stock: 4 }],
		});
		const code = await ops.createDiscountCode({
			code: "SAVE10",
			type: "percent",
			value: 10,
			maxUses: 1,
		});
		const input = checkout(item, {
			items: [{ productId: item.id, variantId: "large", quantity: 2 }],
			discountCode: "SAVE10",
		});
		const response = await stack.handler(
			req("checkout/quote", "POST", {
				...input,
				subtotal: 1,
				tax: 0,
				shipping: 0,
			}),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(await response.json()).toEqual({
			subtotal: 4200,
			discount: 420,
			shipping: 300,
			tax: 408,
			total: 4488,
			currency: "USD",
		});
		expect(await adapter.count({ model: "ecommerceOrder" })).toBe(0);
		expect(await adapter.count({ model: "ecommerceInventory" })).toBe(0);
		expect((await ops.listDiscountCodes({})).items[0]).toMatchObject({
			id: code.id,
			uses: 0,
		});
		expect(calculateShipping).toHaveBeenCalledWith(
			expect.objectContaining({
				subtotal: 4200,
				discount: 420,
				shippingAddress: address,
				currency: "USD",
				lineItems: [
					expect.objectContaining({
						price: 2100,
						quantity: 2,
						variantId: "large",
					}),
				],
			}),
		);
		shipping = 500;
		const result = await ops.createCheckout(input);
		expect(result.quote).toEqual({
			subtotal: 4200,
			discount: 420,
			shipping: 500,
			tax: 428,
			total: 4708,
			currency: "USD",
		});
		expect(await ops.getOrder({ id: result.orderId })).toMatchObject(
			result.quote,
		);
		shipping = 800;
		expect(await ops.createCheckout(input)).toEqual(result);
		expect(calculateShipping).toHaveBeenCalledTimes(2);
		expect(calculateTax).toHaveBeenCalledTimes(2);
		expect((await ops.listDiscountCodes({})).items[0]?.uses).toBe(1);
		await expect(
			ops.createCheckout({
				...input,
				shippingAddress: { ...address, postalCode: "10001" },
			}),
		).rejects.toThrow("different details");
		await ops.deleteDiscountCode({ id: code.id });
		expect(await ops.createCheckout(input)).toEqual(result);
		expect(
			(await ops.getOrder({ id: result.orderId })).subtotal -
				result.quote.discount,
		).toBe(3780);
	});

	it("defaults legacy orders to zero tax and preserves static shipping", async () => {
		const { ops, adapter } = await setup({ shippingAmount: 350 });
		const item = await product(ops);
		const input = checkout(item);
		expect(await ops.previewCheckout(input)).toMatchObject({
			subtotal: 1800,
			discount: 0,
			shipping: 350,
			tax: 0,
			total: 2150,
		});
		const result = await ops.createCheckout(input);
		await adapter.update({
			model: "ecommerceOrder",
			where: [{ field: "id", value: result.orderId }],
			update: { tax: null },
		});
		expect((await ops.getOrder({ id: result.orderId })).tax).toBe(0);
	});

	it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid calculator amount %s before payment",
		async (amount) => {
			const createPayment = vi.fn(async () => ({ redirectUrl: "/pay" }));
			const { ops } = await setup({
				calculateTax: () => amount,
				paymentAdapter: { ...demoAdapter, createPayment },
			});
			const item = await product(ops);
			await expect(ops.previewCheckout(checkout(item))).rejects.toThrow(
				"Invalid tax calculation",
			);
			await expect(ops.createCheckout(checkout(item))).rejects.toThrow(
				"Invalid tax calculation",
			);
			expect(createPayment).not.toHaveBeenCalled();
			expect((await ops.getProduct({ slug: item.slug })).stock).toBe(10);
		},
	);

	it("rejects unavailable stock, invalid variants, mixed currency, and expired discounts in quotes", async () => {
		const { ops } = await setup();
		const item = await product(ops, { stock: 1 });
		await expect(
			ops.previewCheckout(
				checkout(item, {
					items: [
						{ productId: item.id, quantity: 1 },
						{ productId: item.id, quantity: 1 },
					],
				}),
			),
		).rejects.toThrow("insufficient stock");
		await expect(
			ops.previewCheckout(
				checkout(item, {
					items: [{ productId: item.id, variantId: "missing", quantity: 1 }],
				}),
			),
		).rejects.toThrow("valid product variant");
		const foreign = await product(ops, { currency: "CAD" });
		await expect(ops.previewCheckout(checkout(foreign))).rejects.toThrow(
			"currency",
		);
		await ops.createDiscountCode({
			code: "EXPIRED",
			type: "fixed",
			value: 100,
			expiresAt: "2020-01-01T00:00:00.000Z",
		});
		await expect(
			ops.previewCheckout(checkout(item, { discountCode: "EXPIRED" })),
		).rejects.toThrow("expired");
	});

	it("authorizes discount listing, creation and deletion across HTTP and request operations", async () => {
		const { ops, stack } = await setup();
		const code = await ops.createDiscountCode({
			code: "SAVE",
			type: "fixed",
			value: 100,
			expiresAt: "2099-01-01T00:00:00.000Z",
		});
		for (const user of [undefined, "buyer"]) {
			for (const request of [
				req("discounts", "GET", undefined, user),
				req("discounts", "POST", { code: "NO", type: "fixed", value: 1 }, user),
				req(`discounts/${code.id}`, "DELETE", undefined, user),
			])
				expect([401, 403]).toContain((await stack.handler(request)).status);
			await expect(
				stack
					.forRequest(req("discounts", "GET", undefined, user))
					.operations.ecommerce.listDiscountCodes({}),
			).rejects.toThrow();
			await expect(
				stack
					.forRequest(req("discounts", "GET", undefined, user))
					.operations.ecommerce.deleteDiscountCode({ id: code.id }),
			).rejects.toThrow();
		}
		const listed = await stack.handler(
			req("discounts", "GET", undefined, "admin"),
		);
		expect(listed.headers.get("cache-control")).toBe("private, no-store");
		expect(await listed.json()).toEqual({ items: [code], total: 1 });
		expect(
			(
				await stack.handler(
					req(`discounts/${code.id}`, "DELETE", undefined, "admin"),
				)
			).status,
		).toBe(200);
		expect(await ops.listDiscountCodes({})).toEqual({ items: [], total: 0 });
		await expect(ops.deleteDiscountCode({ id: code.id })).rejects.toThrow(
			"not found",
		);
	});
});
async function pay(
	stack: Awaited<ReturnType<typeof setup>>["stack"],
	orderId: string,
	amount = 1800,
	extra = {},
) {
	return stack.handler(
		req(
			"webhook",
			"POST",
			{
				orderId,
				amount,
				currency: "USD",
				status: "paid",
				paymentRef: `payment-${orderId}`,
				...extra,
			},
			undefined,
			{ "x-demo-secret": "test-secret" },
		),
	);
}
afterEach(() => vi.unstubAllGlobals());

describe("Ecommerce public operations", () => {
	it("initializes a fresh CMS product type for commerce writes and raw SSG without warming CMS", async () => {
		const { ops, stack } = await setup();
		const endpoint = { baseURL: "https://test.local", basePath: "/api" };
		const item = await product(ops);
		expect((await ops.listProducts({})).items.map((entry) => entry.id)).toEqual(
			[item.id],
		);
		const cache = new QueryClient();
		await stack.raw.ecommerce.prefetchForRoute("shop", cache, { endpoint });
		await stack.raw.ecommerce.prefetchForRoute("product", cache, {
			endpoint,
			slug: item.slug,
		});
		expect(
			cache.getQueryData<Product>(
				ECOMMERCE_QUERY_KEYS.detail(item.slug, endpoint),
			)?.id,
		).toBe(item.id);
		expect(
			cache.getQueryData<{ total: number }>(
				ECOMMERCE_QUERY_KEYS.list({}, endpoint),
			)?.total,
		).toBe(1);
		const fresh = await setup();
		const emptyCache = new QueryClient();
		await fresh.stack.raw.ecommerce.prefetchForRoute("shop", emptyCache, {
			endpoint,
		});
		expect(
			emptyCache.getQueryData<{ total: number }>(
				ECOMMERCE_QUERY_KEYS.list({}, endpoint),
			)?.total,
		).toBe(0);
	});
	it("keeps drafts private and filters category, variant prices, collection and inventory", async () => {
		const { ops, stack } = await setup();
		await product(ops, { status: "draft" });
		await product(ops, { name: "Sold out", stock: 0 });
		const visible = await product(ops, {
			collections: ["Field kit"],
			variants: [
				{
					id: "forest",
					name: "Forest",
					price: 2100,
					stock: 2,
					options: { color: "forest" },
				},
			],
		});
		const response = await stack.handler(
			req(
				"products?category=Stationery&collection=Field%20kit&minPrice=2000&inStock=true",
			),
		);
		expect(response.status).toBe(200);
		const page = await response.json();
		expect(page.items.map((item: Product) => item.id)).toEqual([visible.id]);
		expect(page.items[0].createdAt).toEqual(expect.any(String));
		expect((await ops.listProducts({})).total).toBe(2);
		expect(
			productSchema.safeParse({
				name: "Bad",
				price: 100,
				variants: [
					{ id: "a", name: "A" },
					{ id: "a", name: "B" },
				],
			}).success,
		).toBe(false);
	});
	it("prices variants and discounts on the server, ignores forged totals and reserves stock once", async () => {
		const provider = {
			...demoAdapter,
			createPayment: vi.fn(async () => ({
				redirectUrl: "https://payments.example/checkout",
			})),
		};
		const { ops, stack } = await setup({
			paymentAdapter: provider,
			shippingAmount: 300,
		});
		const item = await product(ops, {
			variants: [{ id: "forest", name: "Forest", price: 2100, stock: 4 }],
		});
		await ops.createDiscountCode({
			code: "save10",
			type: "percent",
			value: 10,
			maxUses: 1,
		});
		const input = checkout(item, {
			items: [{ productId: item.id, variantId: "forest", quantity: 2 }],
			discountCode: "save10",
		});
		const response = await stack.handler(
			req("checkout", "POST", { ...input, total: 1, price: 1 }, "buyer"),
		);
		expect(response.status).toBe(200);
		const result = await response.json();
		const repeat = await stack.handler(req("checkout", "POST", input, "buyer"));
		expect(await repeat.json()).toEqual(result);
		expect(provider.createPayment).toHaveBeenCalledTimes(1);
		expect(provider.createPayment).toHaveBeenCalledWith(
			expect.objectContaining({ amount: 4080, currency: "USD" }),
		);
		const order = await ops.getOrder({ id: result.orderId });
		expect(order).toMatchObject({
			subtotal: 4200,
			discount: 420,
			shipping: 300,
			total: 4080,
			status: "pending",
		});
		expect(order).not.toHaveProperty("accessToken");
		expect((await ops.getProduct({ slug: item.slug })).variants[0]?.stock).toBe(
			2,
		);
		expect(
			(
				await stack.handler(
					req(
						"checkout",
						"POST",
						{ ...input, email: "changed@example.com" },
						"buyer",
					),
				)
			).status,
		).toBe(409);
		await ops.updateOrderStatus({ id: result.orderId, status: "cancelled" });
		expect((await ops.getProduct({ slug: item.slug })).variants[0]?.stock).toBe(
			4,
		);
		expect(
			(
				await ops.validateDiscountCode({
					code: "SAVE10",
					items: [{ productId: item.id, variantId: "forest", quantity: 1 }],
				})
			).discount,
		).toBe(210);
		expect(
			(await stack.handler(req("checkout", "POST", input, "buyer"))).status,
		).toBe(409);
	});
	it("keeps variant inventory authoritative after a stale CMS edit and requires a current stock count for restocking", async () => {
		const { ops, stack } = await setup();
		const item = await product(ops, {
			variants: [{ id: "forest", name: "Forest", stock: 1 }],
		});
		const staleData = productSchema.parse(item);
		const input = checkout(item, {
			items: [{ productId: item.id, variantId: "forest", quantity: 1 }],
		});
		await ops.createCheckout(input);
		const saved = await stack.handler(
			new Request(
				`https://test.local/api/content/${PRODUCT_TYPE_SLUG}/${item.id}`,
				{
					method: "PUT",
					headers: { "content-type": "application/json", "x-user": "admin" },
					body: JSON.stringify({
						data: {
							...staleData,
							description: "A corrected description",
							stock: 99,
						},
					}),
				},
			),
		);
		expect(saved.status).toBe(200);

		expect((await ops.getProduct({ slug: item.slug })).variants[0]?.stock).toBe(
			0,
		);
		expect((await ops.listProducts({ inStock: true })).items).toHaveLength(0);
		await expect(
			ops.createCheckout({ ...input, idempotencyKey: crypto.randomUUID() }),
		).rejects.toThrow("insufficient stock");
		await ops.createDiscountCode({ code: "SAVE", type: "fixed", value: 100 });
		await expect(
			ops.validateDiscountCode({ code: "SAVE", items: input.items }),
		).rejects.toThrow("insufficient stock");
		const restock = {
			productId: item.id,
			variantId: "forest",
			stock: 2,
			expectedStock: 0,
		};
		expect(
			(await stack.handler(req("inventory", "PATCH", restock, "buyer"))).status,
		).toBe(403);
		const results = await Promise.all([
			stack.handler(req("inventory", "PATCH", restock, "admin")),
			stack.handler(
				req("inventory", "PATCH", { ...restock, stock: 3 }, "admin"),
			),
		]);
		expect(results.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		expect([2, 3]).toContain(
			(await ops.getProduct({ slug: item.slug })).variants[0]?.stock,
		);
		expect((await ops.listProducts({ inStock: true })).items).toHaveLength(1);
	});
	it("snapshots resolved Media Library covers in public checkout and guest order confirmation", async () => {
		let adapter!: DBAdapter;
		const stack = createBackendStack({
			basePath: "/api",
			adapter: (db) => {
				adapter = serializedMemory(db);
				return adapter;
			},
			plugins: {
				cms: cmsBackendPlugin({ contentTypes: [PRODUCT_CONTENT_TYPE] }),
				ecommerce: ecommerceBackendPlugin({ paymentAdapter: demoAdapter }),
				media: mediaBackendPlugin({
					storageAdapter: {
						type: "local",
						upload: async () => ({ url: "/uploads/test.jpg" }),
						delete: async () => {},
					},
				}),
			},
		});
		const ops = stack.trusted.ecommerce;
		const url = "https://assets.example.com/field-notebook.jpg";
		const asset = await adapter.create<{ id: string }>({
			model: "mediaAsset",
			data: {
				filename: "field-notebook.jpg",
				originalName: "field-notebook.jpg",
				mimeType: "image/jpeg",
				size: 1024,
				url,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const item = await product(ops, { images: [asset.id] });
		expect((await ops.getProduct({ slug: item.slug })).images).toEqual([url]);
		const response = await stack.handler(
			req("checkout", "POST", checkout(item)),
		);
		expect(response.status).toBe(200);
		const result = await response.json();
		const confirmation = await stack.handler(
			req(`orders/${result.orderId}/confirmation?token=${result.accessToken}`),
		);
		expect(confirmation.status).toBe(200);
		expect((await confirmation.json()).lineItems[0].image).toBe(url);
		const admin = await stack.handler(
			req(`orders/${result.orderId}`, "GET", undefined, "admin"),
		);
		expect((await admin.json()).lineItems[0].image).toBe(url);
		const withoutMedia = await setup();
		const linked = await product(withoutMedia.ops, { images: [url] });
		const direct = await withoutMedia.ops.createCheckout(checkout(linked));
		expect(
			(await withoutMedia.ops.getOrder({ id: direct.orderId })).lineItems[0]
				?.image,
		).toBe(url);
	});
	it("rolls back every reservation when a later line or discount fails", async () => {
		const { ops } = await setup();
		const first = await product(ops, { stock: 1 });
		const second = await product(ops, { stock: 0 });
		await expect(
			ops.createCheckout(
				checkout(first, {
					items: [
						{ productId: first.id, quantity: 1 },
						{ productId: second.id, quantity: 1 },
					],
				}),
			),
		).rejects.toThrow("insufficient stock");
		expect((await ops.getProduct({ slug: first.slug })).stock).toBe(1);
		await expect(
			ops.createCheckout(checkout(first, { discountCode: "MISSING" })),
		).rejects.toThrow("Discount code not found");
		expect((await ops.getProduct({ slug: first.slug })).stock).toBe(1);
		expect((await ops.listOrders({})).total).toBe(0);
	});
	it("allows only one simultaneous buyer to reserve the last item", async () => {
		const { ops } = await setup();
		const item = await product(ops, { stock: 1 });
		const results = await Promise.allSettled([
			ops.createCheckout(checkout(item)),
			ops.createCheckout(checkout(item)),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(0);
		expect((await ops.listOrders({})).total).toBe(1);
	});
	it("claims provider initialization once across concurrent retries and retains an ambiguous failure", async () => {
		const createPayment = vi.fn(async () => {
			throw new Error("Provider connection lost");
		});
		const { ops } = await setup({
			paymentAdapter: { ...demoAdapter, createPayment },
		});
		const item = await product(ops, { stock: 2 });
		const input = checkout(item);
		await Promise.allSettled([
			ops.createCheckout(input),
			ops.createCheckout(input),
		]);
		expect(createPayment).toHaveBeenCalledTimes(1);
		await expect(ops.createCheckout(input)).rejects.toThrow("reconciliation");
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(1);
		expect((await ops.listOrders({})).total).toBe(1);
	});
	it("labels only definitive new checkout rejections as not created", async () => {
		const { ops, stack, adapter } = await setup();
		const item = await product(ops, { stock: 1 });
		const rejected = await stack.handler(
			req(
				"checkout",
				"POST",
				checkout(item, { items: [{ productId: item.id, quantity: 2 }] }),
			),
		);
		expect(rejected.status).toBe(409);
		expect((await rejected.json()).code).toBe("CHECKOUT_NOT_CREATED");
		expect((await ops.listOrders({})).total).toBe(0);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(1);
		const discount = await stack.handler(
			req("checkout", "POST", checkout(item, { discountCode: "UNKNOWN" })),
		);
		expect((await discount.json()).code).toBe("CHECKOUT_NOT_CREATED");
		expect((await ops.listOrders({})).total).toBe(0);
		const input = checkout(item);
		await ops.createCheckout(input);
		const mismatch = await stack.handler(
			req("checkout", "POST", { ...input, email: "changed@example.com" }),
		);
		expect(mismatch.status).toBe(409);
		expect((await mismatch.json()).code).toBe("ECOMMERCE_ERROR");
		const uncertain = await setup({
			paymentAdapter: {
				...demoAdapter,
				createPayment: async () => {
					throw new Error("Provider connection lost");
				},
			},
		});
		const reserved = await product(uncertain.ops);
		const attempt = checkout(reserved);
		const failedPayment = await uncertain.stack.handler(
			req("checkout", "POST", attempt),
		);
		expect(failedPayment.status).toBe(500);
		expect(await failedPayment.text()).not.toContain("CHECKOUT_NOT_CREATED");
		const retry = await uncertain.stack.handler(
			req("checkout", "POST", attempt),
		);
		expect(retry.status).toBe(409);
		expect((await retry.json()).code).toBe("ECOMMERCE_ERROR");
		expect((await uncertain.ops.listOrders({})).total).toBe(1);
		vi.spyOn(adapter, "transaction").mockRejectedValueOnce(
			new Error("Database connection lost"),
		);
		const unknownDb = await stack.handler(
			req("checkout", "POST", checkout(item)),
		);
		expect(unknownDb.status).toBe(500);
		expect(await unknownDb.text()).not.toContain("CHECKOUT_NOT_CREATED");
	});
	it.each([
		[
			"Lemon Squeezy",
			() =>
				lemonSqueezyAdapter("api-key", "secret", {
					storeId: "1",
					variantId: "2",
				}),
		],
		["Stripe PaymentIntent", () => stripeAdapter("sk_test_fixture", "secret")],
	] as const)(
		"rejects unsupported %s zero totals without keeping reservations and accepts a corrected retry",
		async (_name, makeAdapter) => {
			const fetchMock = vi.fn(async () =>
				Response.json({
					client_secret: "client-secret",
					data: { attributes: { url: "https://checkout.example.com/session" } },
				}),
			);
			vi.stubGlobal("fetch", fetchMock);
			const { ops, stack, adapter } = await setup({
				paymentAdapter: makeAdapter(),
			});
			const item = await product(ops);
			await ops.createDiscountCode({
				code: "FREE",
				type: "percent",
				value: 100,
				maxUses: 1,
			});
			const input = checkout(item, { discountCode: "FREE" });
			const rejected = await stack.handler(req("checkout", "POST", input));
			expect(rejected.status).toBe(400);
			expect((await rejected.json()).code).toBe("CHECKOUT_NOT_CREATED");
			expect((await ops.listOrders({})).total).toBe(0);
			expect((await ops.getProduct({ slug: item.slug })).stock).toBe(10);
			expect(
				(
					await adapter.findOne<{ uses: number }>({
						model: "ecommerceDiscountCode",
						where: [{ field: "code", value: "FREE" }],
					})
				)?.uses,
			).toBe(0);
			expect(fetchMock).not.toHaveBeenCalled();
			const free = await product(ops, { price: 0 });
			const freeCheckout = await stack.handler(
				req("checkout", "POST", checkout(free)),
			);
			expect(freeCheckout.status).toBe(400);
			expect((await freeCheckout.json()).code).toBe("CHECKOUT_NOT_CREATED");
			expect((await ops.listOrders({})).total).toBe(0);
			expect((await ops.getProduct({ slug: free.slug })).stock).toBe(10);
			expect(fetchMock).not.toHaveBeenCalled();
			const corrected = await stack.handler(
				req("checkout", "POST", { ...input, discountCode: undefined }),
			);
			expect(corrected.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect((await ops.listOrders({})).total).toBe(1);
			expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
		},
	);
	it("fails closed on an adapter that only offers sequential transaction fallback", async () => {
		const { ops } = await setup({}, false);
		const item = await product(ops);
		await expect(ops.createCheckout(checkout(item))).rejects.toThrow(
			"isolated transaction support",
		);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(10);
	});
	it("requires verified payment with matching totals, delivers the paid hook once and enforces the lifecycle", async () => {
		const onAfterOrderPaid = vi.fn();
		const { ops, stack } = await setup({ hooks: { onAfterOrderPaid } });
		const item = await product(ops);
		const result = await ops.createCheckout(checkout(item));
		expect(
			(
				await stack.handler(
					req("webhook", "POST", {
						orderId: result.orderId,
						status: "paid",
						paymentRef: "x",
						amount: 1800,
						currency: "USD",
					}),
				)
			).status,
		).toBe(400);
		expect((await pay(stack, result.orderId, 1)).status).toBe(400);
		expect((await ops.getOrder({ id: result.orderId })).status).toBe("pending");
		await expect(
			ops.updateOrderStatus({ id: result.orderId, status: "paid" }),
		).rejects.toThrow("Invalid order status transition");
		expect((await pay(stack, result.orderId)).status).toBe(200);
		expect((await pay(stack, result.orderId)).status).toBe(200);
		expect(onAfterOrderPaid).toHaveBeenCalledTimes(1);
		expect(
			(await pay(stack, result.orderId, 1800, { paymentRef: "different" }))
				.status,
		).toBe(409);
		await ops.updateOrderStatus({ id: result.orderId, status: "fulfilling" });
		await ops.updateOrderStatus({ id: result.orderId, status: "fulfilled" });
		await expect(
			ops.updateOrderStatus({ id: result.orderId, status: "cancelled" }),
		).rejects.toThrow("Invalid order status transition");
	});
	it("retries undelivered paid hooks on verified replay without repeating the payment or stock transition", async () => {
		const onAfterOrderPaid = vi
			.fn()
			.mockRejectedValueOnce(new Error("Fulfillment unavailable"))
			.mockResolvedValue(undefined);
		const { ops, stack, adapter } = await setup({
			hooks: { onAfterOrderPaid },
		});
		const item = await product(ops);
		const result = await ops.createCheckout(checkout(item));
		expect((await pay(stack, result.orderId)).status).toBe(500);
		expect((await ops.getOrder({ id: result.orderId })).paymentStatus).toBe(
			"paid",
		);
		expect(
			(
				await adapter.findOne<{ paidHookDelivered: boolean }>({
					model: "ecommerceOrder",
					where: [{ field: "id", value: result.orderId }],
				})
			)?.paidHookDelivered,
		).toBe(false);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
		expect((await pay(stack, result.orderId)).status).toBe(200);
		expect(
			(
				await adapter.findOne<{ paidHookDelivered: boolean }>({
					model: "ecommerceOrder",
					where: [{ field: "id", value: result.orderId }],
				})
			)?.paidHookDelivered,
		).toBe(true);
		expect((await pay(stack, result.orderId)).status).toBe(200);
		expect(onAfterOrderPaid).toHaveBeenCalledTimes(2);
		expect(onAfterOrderPaid.mock.calls.map(([order]) => order.id)).toEqual([
			result.orderId,
			result.orderId,
		]);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
	});
	it("separates admin orders, customer history and guest confirmation tokens", async () => {
		const { ops, stack } = await setup();
		const item = await product(ops);
		const response = await stack.handler(
			req("checkout", "POST", checkout(item), "buyer"),
		);
		const result = await response.json();
		expect((await stack.handler(req("orders"))).status).toBe(401);
		expect(
			(
				await stack.handler(
					req(`orders/${result.orderId}`, "GET", undefined, "buyer"),
				)
			).status,
		).toBe(403);
		expect(
			(await stack.handler(req("orders", "GET", undefined, "admin"))).status,
		).toBe(200);
		const mine = await stack.handler(
			req("orders/mine", "GET", undefined, "buyer"),
		);
		expect((await mine.json()).total).toBe(1);
		const other = await stack.handler(
			req("orders/mine", "GET", undefined, "other"),
		);
		expect((await other.json()).total).toBe(0);
		expect(
			(
				await stack.handler(
					req(`orders/${result.orderId}/confirmation?token=wrong`),
				)
			).status,
		).toBe(404);
		const confirmation = await stack.handler(
			req(`orders/${result.orderId}/confirmation?token=${result.accessToken}`),
		);
		expect(confirmation.status).toBe(200);
		expect(confirmation.headers.get("cache-control")).toBe("private, no-store");
		expect(await confirmation.json()).not.toHaveProperty("accessToken");
	});
	it("hydrates only published storefront data under the same endpoint keys with ISO dates", async () => {
		const { ops, stack } = await setup();
		const item = await product(ops);
		await product(ops, { status: "draft" });
		const queryClient = new QueryClient();
		const endpoint = { baseURL: "https://test.local", basePath: "/api" };
		await stack.raw.ecommerce.prefetchForRoute("shop", queryClient, {
			endpoint,
		});
		await stack.raw.ecommerce.prefetchForRoute("product", queryClient, {
			endpoint,
			slug: item.slug,
		});
		const queries = createEcommerceQueryKeys(
			createApiClient<EcommerceApiRouter>(endpoint),
		);
		expect(queries.ecommerceProducts.list({}, endpoint).queryKey).toEqual(
			ECOMMERCE_QUERY_KEYS.list({}, endpoint),
		);
		const cached = queryClient.getQueryData<Product>(
			queries.ecommerceProducts.detail(item.slug, endpoint).queryKey,
		);
		expect(cached?.createdAt).toEqual(expect.any(String));
		expect(
			queryClient.getQueryData<{ total: number }>(
				ECOMMERCE_QUERY_KEYS.list({}, endpoint),
			)?.total,
		).toBe(1);
		expect(
			queryClient.getQueryData(
				ECOMMERCE_QUERY_KEYS.detail(item.slug, {
					...endpoint,
					basePath: "/other",
				}),
			),
		).toBeUndefined();
	});
});
async function signature(secret: string, raw: string) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return Array.from(
		new Uint8Array(
			await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)),
		),
		(byte) => byte.toString(16).padStart(2, "0"),
	).join("");
}
describe("Ecommerce payment adapters", () => {
	it("verifies Stripe raw signatures, freshness and paid amount; retries use the order idempotency key", async () => {
		const stripe = stripeAdapter("sk_test_fixture", "secret");
		expect(
			stripeAdapter("sk_test_fixture", "secret", {
				successUrl: "https://shop.example.com/success",
				cancelUrl: "https://shop.example.com/cart",
			}).validatePayment?.({ amount: 0, currency: "USD" }),
		).toBeUndefined();
		const timestamp = Math.floor(Date.now() / 1000);
		const raw = JSON.stringify({
			type: "payment_intent.succeeded",
			livemode: false,
			data: {
				object: {
					id: "pi_1",
					metadata: { orderId: "order-1" },
					amount_received: 1800,
					currency: "usd",
				},
			},
		});
		const digest = await signature("secret", `${timestamp}.${raw}`);
		expect(
			await stripe.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: raw,
					headers: { "stripe-signature": `t=${timestamp},v1=${digest}` },
				}),
			),
		).toEqual({
			orderId: "order-1",
			status: "paid",
			paymentRef: "pi_1",
			amount: 1800,
			currency: "usd",
		});
		await expect(
			stripe.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: `${raw} `,
					headers: { "stripe-signature": `t=${timestamp},v1=${digest}` },
				}),
			),
		).rejects.toThrow("signature");
		await expect(
			stripe.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: raw,
					headers: { "stripe-signature": `t=${timestamp - 301},v1=${digest}` },
				}),
			),
		).rejects.toThrow("timestamp");
		for (const [type, object, expected] of [
			["payment_intent.payment_failed", { id: "pi_1", amount: 1800 }, null],
			["payment_intent.canceled", { id: "pi_1", amount: 1800 }, "failed"],
			[
				"checkout.session.completed",
				{
					id: "cs_free",
					amount_total: 0,
					payment_status: "no_payment_required",
				},
				"paid",
			],
		] as const) {
			const payload = JSON.stringify({
				type,
				data: {
					object: {
						...object,
						currency: "usd",
						metadata: { orderId: "order-1" },
					},
				},
			});
			const result = await stripe.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: payload,
					headers: {
						"stripe-signature": `t=${timestamp},v1=${await signature("secret", `${timestamp}.${payload}`)}`,
					},
				}),
			);
			expect(result?.status ?? null).toBe(expected);
		}
		const fetchMock = vi.fn(async () =>
			Response.json({ client_secret: "client-secret" }),
		);
		vi.stubGlobal("fetch", fetchMock);
		expect(
			await stripe.createPayment({
				amount: 1800,
				currency: "USD",
				orderId: "order-1",
			}),
		).toEqual({ clientSecret: "client-secret" });
		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.stripe.com/v1/payment_intents",
			expect.objectContaining({
				headers: expect.objectContaining({ "idempotency-key": "order-1" }),
			}),
		);
	});
	it("verifies Lemon Squeezy signatures, store, mode and exact charged total", async () => {
		const lemon = lemonSqueezyAdapter("api-key", "secret", {
			storeId: "1",
			variantId: "2",
			testMode: true,
		});
		const raw = JSON.stringify({
			meta: {
				event_name: "order_created",
				custom_data: { orderId: "order-1" },
			},
			data: {
				type: "orders",
				id: "ls-1",
				attributes: {
					store_id: 1,
					test_mode: true,
					status: "paid",
					total: 1800,
					currency: "USD",
					first_order_item: { variant_id: 2 },
				},
			},
		});
		expect(
			await lemon.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: raw,
					headers: { "x-signature": await signature("secret", raw) },
				}),
			),
		).toMatchObject({ orderId: "order-1", amount: 1800, status: "paid" });
		await expect(
			lemon.handleWebhook(
				new Request("https://test.local", {
					method: "POST",
					body: raw,
					headers: { "x-signature": "invalid" },
				}),
			),
		).rejects.toThrow("signature");
	});
});

describe("full-order refunds", () => {
	async function refundSetup(
		overrides: Partial<NonNullable<PaymentAdapter["refunds"]>> = {},
	) {
		const refunds: NonNullable<PaymentAdapter["refunds"]> = {
			createRefund: vi.fn(async () => ({ refundRef: "refund-1" })),
			getRefund: vi.fn(async (input) => ({ ...input, status: "confirmed" })),
			...overrides,
		};
		const state = await setup({ paymentAdapter: { ...demoAdapter, refunds } });
		const item = await product(state.ops);
		await state.ops.createDiscountCode({
			code: "REFUND",
			type: "fixed",
			value: 100,
		});
		const result = await state.ops.createCheckout(
			checkout(item, { discountCode: "REFUND" }),
		);
		await pay(state.stack, result.orderId, 1700);
		return { ...state, refunds, item, id: result.orderId };
	}
	it("requires separate refund permissions, explicit confirmation and server-owned amounts", async () => {
		const { stack, refunds, id } = await refundSetup();
		for (const [path, method, body] of [
			[`orders/${id}/refund`, "GET", undefined],
			[`orders/${id}/refund`, "POST", { confirm: true }],
			[`orders/${id}/refund/reconcile`, "POST", undefined],
		] as const) {
			expect((await stack.handler(req(path, method, body))).status).toBe(401);
			expect(
				(await stack.handler(req(path, method, body, "buyer"))).status,
			).toBe(403);
		}
		for (const body of [
			{},
			{ confirm: false },
			{ confirm: true, amount: 999999 },
			{ confirm: true, currency: "EUR" },
		]) {
			expect(
				(await stack.handler(req(`orders/${id}/refund`, "POST", body, "admin")))
					.status,
			).toBe(400);
		}
		expect(refunds.createRefund).not.toHaveBeenCalled();
		const response = await stack.handler(
			req(`orders/${id}/refund`, "POST", { confirm: true }, "admin"),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(refunds.createRefund).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: id,
				amount: 1700,
				currency: "USD",
				paymentRef: `payment-${id}`,
				idempotencyKey: `btst-full-refund:${id}`,
			}),
		);
	});
	it("keeps unsupported and unpaid orders unavailable without changing checkout", async () => {
		const { ops } = await setup();
		const item = await product(ops);
		const checkoutResult = await ops.createCheckout(checkout(item));
		expect(
			await ops.getOrderRefund({ id: checkoutResult.orderId }),
		).toMatchObject({
			supported: false,
			eligible: false,
			amount: 1800,
			attempt: null,
		});
		await expect(
			ops.refundOrder({ id: checkoutResult.orderId, confirm: true }),
		).rejects.toThrow("does not support");
		const state = await refundSetup();
		const pending = await state.ops.createCheckout(checkout(state.item));
		await expect(
			state.ops.refundOrder({ id: pending.orderId, confirm: true }),
		).rejects.toThrow("Only a paid");
	});
	it("persists one attempt across concurrent repeated actions and confirms only by lookup", async () => {
		const { ops, refunds, id, item } = await refundSetup();
		await Promise.all([
			ops.refundOrder({ id, confirm: true }),
			ops.refundOrder({ id, confirm: true }),
		]);
		expect(refunds.createRefund).toHaveBeenCalledTimes(1);
		expect((await ops.getOrder({ id })).paymentStatus).toBe("paid");
		expect((await ops.getOrderRefund({ id })).attempt?.status).toBe("pending");
		await ops.reconcileOrderRefund({ id });
		await ops.reconcileOrderRefund({ id });
		await ops.refundOrder({ id, confirm: true });
		expect(refunds.createRefund).toHaveBeenCalledTimes(1);
		expect(await ops.getOrder({ id })).toMatchObject({
			paymentStatus: "refunded",
			status: "paid",
		});
		expect(
			(await ops.getOrderRefund({ id })).attempt?.history.map(
				(entry) => entry.status,
			),
		).toEqual(["pending", "confirmed"]);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
		expect((await ops.listDiscountCodes({})).items[0]?.uses).toBe(1);
	});
	it("recovers a lost response through reconciliation without another provider creation", async () => {
		const { ops, refunds, id } = await refundSetup({
			createRefund: vi.fn(async () => {
				throw new Error("timeout after success");
			}),
		});
		expect((await ops.refundOrder({ id, confirm: true })).attempt?.status).toBe(
			"uncertain",
		);
		await ops.refundOrder({ id, confirm: true });
		expect((await ops.reconcileOrderRefund({ id })).attempt?.status).toBe(
			"confirmed",
		);
		expect(refunds.createRefund).toHaveBeenCalledTimes(1);
	});
	it.each([
		{ amount: 1701 },
		{ currency: "EUR" },
		{ paymentRef: "another-payment" },
		{ refundRef: "another-refund" },
	])(
		"rejects mismatched authoritative provider results: %o",
		async (mismatch) => {
			const { ops, id } = await refundSetup({
				getRefund: async (input) => ({
					...input,
					status: "confirmed",
					...mismatch,
				}),
			});
			await ops.refundOrder({ id, confirm: true });
			await expect(ops.reconcileOrderRefund({ id })).rejects.toThrow(
				"does not match",
			);
			expect((await ops.getOrder({ id })).paymentStatus).toBe("paid");
		},
	);
	it("preserves definitive failure and handles lookup timeouts without retrying money", async () => {
		let status: "failed" | "pending" = "failed";
		const { ops, refunds, id } = await refundSetup({
			getRefund: vi.fn(async (input) => ({ ...input, status })),
		});
		await ops.refundOrder({ id, confirm: true });
		expect((await ops.reconcileOrderRefund({ id })).attempt?.status).toBe(
			"failed",
		);
		await ops.refundOrder({ id, confirm: true });
		expect(refunds.createRefund).toHaveBeenCalledTimes(1);
		status = "pending";
		expect((await ops.reconcileOrderRefund({ id })).attempt?.status).toBe(
			"pending",
		);
		vi.mocked(refunds.getRefund).mockRejectedValueOnce(new Error("network"));
		expect((await ops.reconcileOrderRefund({ id })).attempt?.status).toBe(
			"uncertain",
		);
	});
	it("accepts duplicate/reordered verified full refunds without restocking or invoking paid hooks", async () => {
		const hook = vi.fn();
		const { stack, ops } = await setup({ hooks: { onAfterOrderPaid: hook } });
		const item = await product(ops);
		const { orderId: id } = await ops.createCheckout(checkout(item));
		for (const event of [
			{ status: "refunded", amount: 999 },
			{ status: "refunded", currency: "EUR" },
		])
			expect((await pay(stack, id, 1800, event)).status).toBe(400);
		for (const status of ["refunded", "paid", "failed", "refunded"])
			expect((await pay(stack, id, 1800, { status })).status).toBe(200);
		expect(await ops.getOrder({ id })).toMatchObject({
			paymentStatus: "refunded",
			status: "pending",
		});
		expect(
			(await ops.getOrderRefund({ id })).attempt?.history.map(
				(entry) => entry.status,
			),
		).toEqual(["confirmed"]);
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(9);
		expect(hook).not.toHaveBeenCalled();
	});
	it("does not regress a webhook confirmation arriving while creation waits", async () => {
		let release!: () => void;
		let started!: () => void;
		const start = new Promise<void>((resolve) => {
			started = resolve;
		});
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { ops, stack, id } = await refundSetup({
			createRefund: async () => {
				started();
				await wait;
				throw new Error("lost response");
			},
		});
		const initiating = ops.refundOrder({ id, confirm: true });
		await start;
		expect((await pay(stack, id, 1700, { status: "refunded" })).status).toBe(
			200,
		);
		release();
		expect((await initiating).attempt?.status).toBe("confirmed");
	});
	it("rejects another provider and preserves fulfillment/cancellation as separate actions", async () => {
		const { ops, adapter, id, item } = await refundSetup();
		await adapter.update({
			model: "ecommerceOrder",
			where: [{ field: "id", value: id }],
			update: { paymentProvider: "unavailable" },
		});
		await expect(ops.refundOrder({ id, confirm: true })).rejects.toThrow(
			"provider is unavailable",
		);
		await adapter.update({
			model: "ecommerceOrder",
			where: [{ field: "id", value: id }],
			update: { paymentProvider: "demo" },
		});
		await ops.updateOrderStatus({ id, status: "fulfilling" });
		await ops.refundOrder({ id, confirm: true });
		await ops.reconcileOrderRefund({ id });
		expect((await ops.getOrder({ id })).status).toBe("fulfilling");
		await ops.updateOrderStatus({ id, status: "cancelled" });
		await ops.reconcileOrderRefund({ id });
		expect((await ops.getProduct({ slug: item.slug })).stock).toBe(10);
	});
});
