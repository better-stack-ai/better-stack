import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ecommerceSchema } from "../db";
import {
	checkoutSchema,
	createDiscountSchema,
	orderStatusSchema,
	ordersQuerySchema,
	productSchema,
	productsQuerySchema,
} from "../schemas";
import type { ProductsFilters } from "../types";
import { listProducts, getProduct } from "./getters";
import { ecommerceError } from "./mutations";
import {
	createEcommerceOperations,
	discountValidationSchema,
	type EcommerceBackendConfig,
} from "./operations";
import {
	ECOMMERCE_QUERY_KEYS,
	type EcommerceEndpointPartition,
} from "./query-key-defs";

/** Only the public storefront routes can be statically generated. */
export type EcommerceRouteKey = "shop" | "product";
interface EcommercePrefetchForRoute {
	(
		key: "shop",
		queryClient: QueryClient,
		options: {
			endpoint: EcommerceEndpointPartition;
			filters?: ProductsFilters;
		},
	): Promise<void>;
	(
		key: "product",
		queryClient: QueryClient,
		options: { endpoint: EcommerceEndpointPartition; slug: string },
	): Promise<void>;
}
/** CMS-backed storefront, authoritative checkout, verified payments and protected order management. */
export function ecommerceBackendPlugin(config: EcommerceBackendConfig) {
	z.string()
		.regex(/^[A-Z]{3}$/)
		.parse(config.currency ?? "USD");
	z.number()
		.int()
		.min(0)
		.max(100_000_000)
		.parse(config.shippingAmount ?? 0);
	const mediaAdapters = new WeakSet<Adapter>();
	return defineBackendPlugin({
		id: "ecommerce",
		dbPlugin: ecommerceSchema,
		operations: (adapter, context) => {
			if (
				!Object.values(context?.plugins ?? {}).some(
					(plugin) => plugin.id === "cms",
				)
			)
				throw new Error(
					"Ecommerce requires the CMS backend with PRODUCT_CONTENT_TYPE registered",
				);
			const mediaAvailable = Object.values(context?.plugins ?? {}).some(
				(plugin) => plugin.id === "media",
			);
			if (mediaAvailable) mediaAdapters.add(adapter);
			return createEcommerceOperations(adapter, config, mediaAvailable);
		},
		raw: (adapter: Adapter) => ({
			prefetchForRoute: (async (
				key: EcommerceRouteKey,
				queryClient: QueryClient,
				options: {
					endpoint: EcommerceEndpointPartition;
					filters?: ProductsFilters;
					slug?: string;
				},
			) => {
				if (key === "shop")
					queryClient.setQueryData(
						ECOMMERCE_QUERY_KEYS.list(options.filters ?? {}, options.endpoint),
						await listProducts(
							adapter,
							options.filters,
							mediaAdapters.has(adapter),
						),
					);
				else {
					const product = await getProduct(
						adapter,
						options.slug ?? "",
						mediaAdapters.has(adapter),
					);
					if (!product) ecommerceError(404, "Product not found");
					queryClient.setQueryData(
						ECOMMERCE_QUERY_KEYS.detail(product.slug, options.endpoint),
						product,
					);
				}
			}) as EcommercePrefetchForRoute,
		}),
		routes: (_adapter, _context, operations) => ({
			listProducts: createEndpoint(
				"/shop/products",
				{ method: "GET", query: productsQuerySchema, requireRequest: true },
				operations.listProducts.route((ctx) => ctx.query),
			),
			getProduct: createEndpoint(
				"/shop/products/:slug",
				{ method: "GET", requireRequest: true },
				operations.getProduct.route((ctx) => ({ slug: ctx.params.slug })),
			),
			createProduct: createEndpoint(
				"/shop/products",
				{
					method: "POST",
					body: z.object({ slug: z.string(), data: productSchema }),
					requireRequest: true,
				},
				operations.createProduct.route((ctx) => ctx.body),
			),
			createDiscountCode: createEndpoint(
				"/shop/discounts",
				{ method: "POST", body: createDiscountSchema, requireRequest: true },
				operations.createDiscountCode.route((ctx) => ctx.body),
			),
			validateDiscountCode: createEndpoint(
				"/shop/discounts/validate",
				{
					method: "POST",
					body: discountValidationSchema,
					requireRequest: true,
				},
				operations.validateDiscountCode.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.body;
				}),
			),
			createCheckout: createEndpoint(
				"/shop/checkout",
				{ method: "POST", body: checkoutSchema, requireRequest: true },
				operations.createCheckout.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.body;
				}),
			),
			listOrders: createEndpoint(
				"/shop/orders",
				{ method: "GET", query: ordersQuerySchema, requireRequest: true },
				operations.listOrders.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			listMyOrders: createEndpoint(
				"/shop/orders/mine",
				{ method: "GET", query: ordersQuerySchema, requireRequest: true },
				operations.listMyOrders.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return ctx.query;
				}),
			),
			getOrder: createEndpoint(
				"/shop/orders/:id",
				{ method: "GET", requireRequest: true },
				operations.getOrder.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { id: ctx.params.id };
				}),
			),
			getOrderConfirmation: createEndpoint(
				"/shop/orders/:id/confirmation",
				{
					method: "GET",
					query: z.object({ token: z.string().max(200) }),
					requireRequest: true,
				},
				operations.getOrderConfirmation.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { id: ctx.params.id, token: ctx.query.token };
				}),
			),
			updateOrderStatus: createEndpoint(
				"/shop/orders/:id",
				{
					method: "PATCH",
					body: z.object({ status: orderStatusSchema }),
					requireRequest: true,
				},
				operations.updateOrderStatus.route((ctx) => ({
					id: ctx.params.id,
					status: ctx.body.status,
				})),
			),
			handleWebhook: createEndpoint(
				"/shop/webhook",
				{ method: "POST", requireRequest: true, disableBody: true },
				operations.handleWebhook.route(() => ({})),
			),
		}),
	});
}
export type EcommerceApiRouter = ReturnType<
	ReturnType<typeof ecommerceBackendPlugin>["routes"]
>;
