import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { EcommerceApiRouter } from "./api/plugin";
import {
	ecommerceEndpointDiscriminator,
	productsListDiscriminator,
	type EcommerceEndpointPartition,
} from "./api/query-key-defs";
import type {
	CartItem,
	CheckoutInput,
	CheckoutResult,
	Order,
	OrdersPage,
	OrderStatus,
	Product,
	ProductsPage,
	CreateDiscountInput,
	DiscountCodesPage,
	SerializedDiscountCode,
} from "./types";
import type { StackIdentity } from "@btst/stack/context";

/** Public catalog filters; prices use integer minor units. */
export interface ProductFilters {
	category?: string;
	collection?: string;
	search?: string;
	minPrice?: number;
	maxPrice?: number;
	inStock?: boolean;
	limit?: number;
	offset?: number;
}
export interface OrderFilters {
	status?: OrderStatus;
	limit?: number;
	offset?: number;
}
export interface EcommerceQueryScope {
	identity: StackIdentity | null | string;
	endpoint: EcommerceEndpointPartition;
}
export interface DiscountResult {
	code: string;
	discount: number;
	subtotal: number;
	total: number;
	currency: string;
}

export const ecommerceResources = {
	ecommerceDiscounts: {
		queries: {
			list: {
				path: "/shop/discounts",
				query: (
					filters: { limit?: number; offset?: number },
					_scope: EcommerceQueryScope,
				) => filters,
				key: (
					filters: { limit?: number; offset?: number },
					scope: EcommerceQueryScope,
				) => [filters, scope],
				select: (data: any) => data as DiscountCodesPage,
			},
		},
		mutations: {
			create: {
				path: "@post/shop/discounts",
				method: "POST" as const,
				input: (input: CreateDiscountInput) => ({ body: input }),
				select: (data: any) => data as SerializedDiscountCode,
				invalidates: ["ecommerceDiscounts"],
				refresh: false,
			},
			delete: {
				path: "@delete/shop/discounts/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				invalidates: ["ecommerceDiscounts"],
				refresh: false,
			},
		},
	},
	ecommerceProducts: {
		queries: {
			list: {
				path: "/shop/products",
				query: (
					filters: ProductFilters,
					_endpoint: EcommerceEndpointPartition,
				) => productsListDiscriminator(filters),
				key: (
					filters: ProductFilters,
					endpoint: EcommerceEndpointPartition,
				) => [
					productsListDiscriminator(filters),
					ecommerceEndpointDiscriminator(endpoint),
				],
				select: (data: any) => data as ProductsPage,
			},
			detail: {
				path: "/shop/products/:slug",
				params: (slug: string, _endpoint: EcommerceEndpointPartition) => ({
					slug,
				}),
				key: (slug: string, endpoint: EcommerceEndpointPartition) => [
					slug,
					ecommerceEndpointDiscriminator(endpoint),
				],
				select: (data: any) => data as Product,
			},
		},
	},
	ecommerceOrders: {
		queries: {
			list: {
				path: "/shop/orders",
				query: (filters: OrderFilters, _scope: EcommerceQueryScope) => ({
					...filters,
				}),
				key: (filters: OrderFilters, scope: EcommerceQueryScope) => [
					filters,
					scope,
				],
				select: (data: any) => data as OrdersPage,
			},
			mine: {
				path: "/shop/orders/mine",
				query: (filters: OrderFilters, _scope: EcommerceQueryScope) => ({
					...filters,
				}),
				key: (filters: OrderFilters, scope: EcommerceQueryScope) => [
					filters,
					scope,
				],
				select: (data: any) => data as OrdersPage,
			},
			detail: {
				path: "/shop/orders/:id",
				params: (id: string, _scope: EcommerceQueryScope) => ({ id }),
				key: (id: string, scope: EcommerceQueryScope) => [id, scope],
				select: (data: any) => data as Order,
			},
			confirmation: {
				path: "/shop/orders/:id/confirmation",
				params: (
					id: string,
					_token: string,
					_endpoint: EcommerceEndpointPartition,
				) => ({ id }),
				query: (
					_id: string,
					token: string,
					_endpoint: EcommerceEndpointPartition,
				) => ({ token }),
				key: (
					id: string,
					token: string,
					endpoint: EcommerceEndpointPartition,
				) => [id, token, ecommerceEndpointDiscriminator(endpoint)],
				select: (data: any) => data as Order,
				skip: (
					_id: string,
					token: string,
					_endpoint: EcommerceEndpointPartition,
				) => !token,
			},
		},
		mutations: {
			retryDelivery: {
				path: "@post/shop/orders/:id/deliveries/:grantId/retry",
				method: "POST" as const,
				input: ({ id, grantId }: { id: string; grantId: string }) => ({
					params: { id, grantId },
					body: {},
				}),
				invalidates: ["ecommerceOrders"],
				refresh: false,
			},
			claimDelivery: {
				path: "@post/shop/orders/:id/deliveries/claim",
				method: "POST" as const,
				input: ({ id, token }: { id: string; token: string }) => ({
					params: { id },
					body: { token },
				}),
				select: (data: any) => data as Order,
				invalidates: ["ecommerceOrders"],
				refresh: false,
			},
			issueGuestDeliveryToken: {
				path: "@post/shop/orders/:id/deliveries/guest-token",
				method: "POST" as const,
				input: ({ id }: { id: string }) => ({
					params: { id },
					body: { expiresInSeconds: 3600 },
				}),
				select: (data: any) => data as { token: string; expiresAt: string },
				refresh: false,
			},
			checkout: {
				path: "@post/shop/checkout",
				method: "POST" as const,
				input: (input: CheckoutInput) => ({ body: input }),
				select: (data: any) => data as CheckoutResult,
				refresh: false,
			},
			updateStatus: {
				path: "@patch/shop/orders/:id",
				method: "PATCH" as const,
				input: ({ id, status }: { id: string; status: OrderStatus }) => ({
					params: { id },
					body: { status },
				}),
				select: (data: any) => data as Order,
				refresh: false,
			},
			validateDiscount: {
				path: "@post/shop/discounts/validate",
				method: "POST" as const,
				input: (input: { code: string; items: CartItem[] }) => ({
					body: input,
				}),
				select: (data: any) => data as DiscountResult,
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createEcommerceQueryKeys(
	client: ReturnType<typeof createApiClient<EcommerceApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, ecommerceResources, headers);
}
