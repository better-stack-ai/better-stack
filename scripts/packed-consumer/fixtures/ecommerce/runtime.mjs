import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as cms from "@btst/plugin-cms/api";
import * as media from "@btst/plugin-media/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import * as commerce from "@btst/plugin-ecommerce/api";
import { z } from "zod";

const require = createRequire(import.meta.url);
for (const sdk of ["@vercel/blob", "@aws-sdk/client-s3"]) {
	assert.throws(() => require.resolve(sdk), { code: "MODULE_NOT_FOUND" });
}
const address = {
	name: "Packed buyer",
	line1: "12 Pine St",
	city: "Boston",
	region: "MA",
	postalCode: "02108",
	country: "US",
};

function serializedMemory(db) {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function lock(run) {
		const previous = tail;
		let release;
		tail = new Promise((resolve) => {
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
		...Object.fromEntries(
			[
				"create",
				"findOne",
				"findMany",
				"count",
				"update",
				"updateMany",
				"delete",
				"deleteMany",
				"transaction",
			].map((method) => [
				method,
				(input) => lock(() => adapter[method](input)),
			]),
		),
	};
}

async function verify(modules, withMedia) {
	const {
		createBackendStack,
		defineAuthorization,
		createServerAuth,
		cmsBackendPlugin,
		mediaBackendPlugin,
		ecommerceBackendPlugin,
		PRODUCT_CONTENT_TYPE,
		ecommercePermissions,
		cmsPermissions,
		ECOMMERCE_QUERY_KEYS,
	} = modules;
	const auth = createServerAuth({
		authorization: defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [cmsPermissions, ecommercePermissions],
			rules: ({ ecommerce }) => [
				ecommerce.product.read.allow(),
				ecommerce.checkout.create.allow(),
				ecommerce.product.manage.when(
					({ identity }) => identity?.id === "admin",
				),
				ecommerce.order.read.when(({ identity }) => identity?.id === "admin"),
			],
		}),
		getIdentity: ({ request }) => ({
			id: request.headers.get("x-user") ?? "buyer",
		}),
	});
	const plugins = () => ({
		cms: cmsBackendPlugin({ contentTypes: [PRODUCT_CONTENT_TYPE] }),
		ecommerce: ecommerceBackendPlugin({
			paymentAdapter: {
				name: "fixture",
				createPayment: async () => ({
					redirectUrl: "https://payments.example.test/checkout",
				}),
				handleWebhook: async () => null,
			},
		}),
		...(withMedia
			? {
					media: mediaBackendPlugin({
						storageAdapter: {
							type: "local",
							upload: async () => ({ url: "/uploads/fixture.jpg" }),
							delete: async () => undefined,
						},
					}),
				}
			: {}),
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: serializedMemory,
		auth,
		plugins: plugins(),
	});
	const adminRequest = new Request("https://example.test/api", {
		headers: { "x-user": "admin" },
	});
	const buyerRequest = new Request("https://example.test/api");
	const admin = stack.forRequest(adminRequest).operations.ecommerce;
	const buyer = stack.forRequest(buyerRequest).operations.ecommerce;
	const image = withMedia
		? "v5-product-cover"
		: "https://assets.example.test/cover.jpg";
	if (withMedia)
		await stack.adapter.create({
			model: "mediaAsset",
			forceAllowId: true,
			data: {
				id: image,
				filename: "cover.jpg",
				originalName: "cover.jpg",
				mimeType: "image/jpeg",
				size: 1024,
				url: "https://assets.example.test/cover.jpg",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	const product = await admin.createProduct({
		slug: "packed-product",
		data: {
			name: "Packed notebook",
			price: 1800,
			stock: 10,
			status: "published",
			images: [image],
		},
	});
	assert.equal(product.id.length > 0, true);
	assert.deepEqual((await buyer.getProduct({ slug: product.slug })).images, [
		"https://assets.example.test/cover.jpg",
	]);
	await assert.rejects(
		buyer.createProduct({
			slug: "forbidden",
			data: { name: "Forbidden", price: 1800 },
		}),
		{ statusCode: 403 },
	);
	await assert.rejects(
		admin.createProduct({
			slug: "invalid",
			data: { name: "Invalid", price: -1 },
		}),
		{ name: "ZodError" },
	);
	const result = await buyer.createCheckout({
		items: [{ productId: product.id, quantity: 2 }],
		email: "buyer@example.test",
		shippingAddress: address,
		idempotencyKey: crypto.randomUUID(),
	});
	const order = await admin.getOrder({ id: result.orderId });
	assert.equal(order.total, 3600);
	assert.equal(
		order.lineItems[0].image,
		"https://assets.example.test/cover.jpg",
	);
	assert.equal((await buyer.getProduct({ slug: product.slug })).stock, 8);
	const restored = createBackendStack({
		basePath: "/api",
		adapter: () => stack.adapter,
		auth,
		plugins: plugins(),
	});
	assert.equal(
		(await restored.trusted.ecommerce.getOrder({ id: result.orderId })).id,
		order.id,
	);
	const queryClient = new QueryClient();
	const endpoint = { baseURL: "https://example.test", basePath: "/api" };
	await restored.raw.ecommerce.prefetchForRoute("product", queryClient, {
		endpoint,
		slug: product.slug,
	});
	assert.equal(
		queryClient.getQueryData(
			ECOMMERCE_QUERY_KEYS.detail(product.slug, endpoint),
		).id,
		product.id,
	);
	queryClient.clear();
	const unsafe = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth,
		plugins: plugins(),
	});
	const unsafeProduct = await unsafe.trusted.ecommerce.createProduct({
		slug: "unsafe",
		data: {
			name: "Unsafe adapter",
			price: 1800,
			stock: 10,
			status: "published",
		},
	});
	await assert.rejects(
		unsafe.trusted.ecommerce.createCheckout({
			items: [{ productId: unsafeProduct.id, quantity: 1 }],
			email: "buyer@example.test",
			shippingAddress: address,
			idempotencyKey: crypto.randomUUID(),
		}),
		/isolated transaction support/,
	);
}

for (const withMedia of [false, true]) {
	await verify(
		{
			...core,
			...authorization,
			...serverAuth,
			...cms,
			...media,
			...commerce,
			cmsPermissions,
		},
		withMedia,
	);
	await verify(
		{
			...require("@btst/stack/api"),
			...require("@btst/stack/authorization"),
			...require("@btst/stack/authorization/server"),
			...require("@btst/plugin-cms/api"),
			...require("@btst/plugin-media/api"),
			...require("@btst/plugin-ecommerce/api"),
			...require("@btst/plugin-cms/permissions"),
		},
		withMedia,
	);
}
console.log(
	"Packed Ecommerce ESM/CJS CMS, optional Media, checkout/auth/validation/data/SSG and unsafe-adapter rejection passed",
);
