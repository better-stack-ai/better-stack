import { lazy, type ComponentType } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { normalizePath } from "@btst/stack/client";
import type { StackIdentity } from "@btst/stack/context";
import type { EcommerceApiRouter } from "../api/plugin";
import { createEcommerceQueryKeys } from "../query-keys";
import { ECOMMERCE_PLUGIN_ID } from "./constants";
import type { EcommercePluginOverrides } from "./overrides";

const ProductList = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.ProductListPageComponent,
	})),
);
const ProductDetail = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.ProductDetailPageComponent,
	})),
);
const Cart = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.CartPageComponent,
	})),
);
const Checkout = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.CheckoutPageComponent,
	})),
);
const Confirmation = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.OrderConfirmationPageComponent,
	})),
);
const Orders = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.OrdersAdminPageComponent,
	})),
);
const OrderDetail = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.OrderDetailPageComponent,
	})),
);
const MyOrders = lazy(() =>
	import("./components/pages/route-page").then((m) => ({
		default: m.MyOrdersPageComponent,
	})),
);

/** Context for catalog SSR lifecycle callbacks. */
export interface EcommerceLoaderContext {
	path: string;
	isSSR: boolean;
}
/** Ecommerce page prefetch lifecycle, after shared runtime resolution. */
export interface EcommerceClientHooks {
	beforeLoad?: (context: EcommerceLoaderContext) => void | Promise<void>;
	afterLoad?: (context: EcommerceLoaderContext) => void | Promise<void>;
	onErrorLoad?: (
		error: Error,
		context: EcommerceLoaderContext,
	) => void | Promise<void>;
}
/** Plugin-specific storefront settings. API/site endpoints belong to createClientStack. */
export interface EcommerceClientConfig {
	/** Default display currency for custom storefront components. */
	currency?: string;
	/** Request identity snapshot for consumer-specific page replacements. */
	identityPartition?: StackIdentity | null;
	/** SSR catalog lifecycle callbacks. */
	hooks?: EcommerceClientHooks;
	/** Replace individual route components without replacing the plugin. */
	pageComponents?: {
		shop?: ComponentType;
		product?: ComponentType<{ slug: string }>;
		cart?: ComponentType;
		checkout?: ComponentType;
		orderConfirmation?: ComponentType<{ id: string }>;
		orders?: ComponentType;
		orderDetail?: ComponentType<{ id: string }>;
		myOrders?: ComponentType;
	};
}

/** Register the catalog, cart, checkout and order pages in the resolved client stack. */
export const ecommerceClientPlugin = (config: EcommerceClientConfig = {}) =>
	defineClientPlugin<EcommercePluginOverrides>()({
		id: ECOMMERCE_PLUGIN_ID,
		providerConfig: { currency: config.currency ?? "USD" },
		resolve: (
			runtime: ResolvedClientPluginRuntime<typeof ECOMMERCE_PLUGIN_ID>,
		) => {
			const queries = createEcommerceQueryKeys(
				createApiClient<EcommerceApiRouter>({
					baseURL: runtime.api.baseURL,
					basePath: runtime.api.basePath,
					headers: runtime.api.headers,
					credentials: runtime.api.credentials,
				}),
			);
			const endpoint = {
				baseURL: runtime.api.baseURL,
				basePath: runtime.api.basePath,
			};
			const load = (slug?: string) => async () => {
				if (typeof window !== "undefined") return;
				const context = {
					path: slug ? `/shop/products/${slug}` : "/shop",
					isSSR: true,
				};
				const query = slug
					? queries.ecommerceProducts.detail(slug, endpoint)
					: queries.ecommerceProducts.list({}, endpoint);
				try {
					await config.hooks?.beforeLoad?.(context);
					if (slug)
						await runtime.queryClient.prefetchQuery(
							queries.ecommerceProducts.detail(slug, endpoint),
						);
					else
						await runtime.queryClient.prefetchQuery(
							queries.ecommerceProducts.list({}, endpoint),
						);
					const error = runtime.queryClient.getQueryState(
						query.queryKey,
					)?.error;
					if (error) throw error;
					await config.hooks?.afterLoad?.(context);
				} catch (error) {
					if (isConnectionError(error))
						console.warn(
							"[btst/ecommerce] No catalog server at build time. Use stack.raw.ecommerce.prefetchForRoute() for SSG.",
						);
					else
						await runtime.queryClient.prefetchQuery({
							queryKey: query.queryKey,
							queryFn: () => {
								throw createSanitizedSSRLoaderError();
							},
							retry: false,
						});
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						/* Error reporting must not reject SSR loaders. */
					}
				}
			};
			const meta =
				(title: string, path: string, privatePage = true) =>
				() => [
					{ title },
					{ name: "description", content: title },
					{
						property: "og:url",
						content: `${runtime.site.baseURL}${normalizePath(`${runtime.site.basePath}/${path}`)}`,
					},
					...(privatePage
						? [{ name: "robots", content: "noindex, nofollow" }]
						: []),
				];
			return {
				routes: () =>
					defineRoutes(
						{
							shop: defineRoute("/shop", {
								page: ProductList,
								loader: load(),
								meta: meta("Shop", "/shop", false),
							}),
							cart: defineRoute("/shop/cart", {
								page: Cart,
								meta: meta("Your cart", "/shop/cart"),
							}),
							checkout: defineRoute("/shop/checkout", {
								page: Checkout,
								meta: meta("Checkout", "/shop/checkout"),
							}),
							orders: defineRoute("/shop/admin/orders", {
								page: Orders,
								meta: meta("Orders", "/shop/admin/orders"),
							}),
							orderDetail: defineRoute("/shop/admin/orders/:id", {
								page: ({ params }) => <OrderDetail id={params.id} />,
								meta: ({ params }) =>
									meta("Order details", `/shop/admin/orders/${params.id}`)(),
							}),
							myOrders: defineRoute("/shop/orders", {
								page: MyOrders,
								meta: meta("My orders", "/shop/orders"),
							}),
							orderConfirmation: defineRoute("/shop/orders/:id/confirmation", {
								page: ({ params }) => <Confirmation id={params.id} />,
								meta: ({ params }) =>
									meta(
										"Order confirmation",
										`/shop/orders/${params.id}/confirmation`,
									)(),
							}),
							product: defineRoute("/shop/products/:slug", {
								page: ({ params }) => <ProductDetail slug={params.slug} />,
								loader: ({ params }) => load(params.slug)(),
								meta: ({ params }) => {
									const product = runtime.queryClient.getQueryData<
										import("../types").Product
									>(
										queries.ecommerceProducts.detail(params.slug, endpoint)
											.queryKey,
									);
									return meta(
										product?.name ?? "Product",
										`/shop/products/${params.slug}`,
										false,
									)();
								},
							}),
						},
						{ pages: config.pageComponents },
					),
			};
		},
	});
