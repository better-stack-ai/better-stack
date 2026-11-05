import type { ProductsFilters } from "../types";
/** API location used to partition storefront caches shared by multiple stacks. */
export interface EcommerceEndpointPartition {
	baseURL: string;
	basePath: string;
}
export function ecommerceEndpointDiscriminator(
	endpoint: EcommerceEndpointPartition,
) {
	return { baseURL: endpoint.baseURL, basePath: endpoint.basePath };
}
export function productsListDiscriminator(filters: ProductsFilters = {}) {
	return {
		category: filters.category?.trim() || undefined,
		collection: filters.collection?.trim() || undefined,
		search: filters.search?.trim() || undefined,
		minPrice: filters.minPrice,
		maxPrice: filters.maxPrice,
		inStock: filters.inStock,
		limit: filters.limit ?? 24,
		offset: filters.offset ?? 0,
	};
}
export const ECOMMERCE_QUERY_KEYS = {
	list: (filters: ProductsFilters, endpoint: EcommerceEndpointPartition) =>
		[
			"ecommerceProducts",
			"list",
			productsListDiscriminator(filters),
			ecommerceEndpointDiscriminator(endpoint),
		] as const,
	detail: (slug: string, endpoint: EcommerceEndpointPartition) =>
		[
			"ecommerceProducts",
			"detail",
			slug,
			ecommerceEndpointDiscriminator(endpoint),
		] as const,
};
