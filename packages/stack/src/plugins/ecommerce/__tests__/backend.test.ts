import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient } from "@btst/stack/plugins/client";
import { createEcommerceQueryKeys } from "../query-keys";
import type { EcommerceApiRouter } from "../api";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { cmsBackendPlugin } from "../../cms/api";
import { cmsPermissions } from "../../cms/permissions";
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
