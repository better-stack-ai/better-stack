"use client";
import { useMemo } from "react";
import { useStack } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { ecommerceResources, type ProductFilters } from "../../query-keys";
import { ECOMMERCE_PLUGIN_ID } from "../constants";

export const ecommerce = createResource({
	plugin: ECOMMERCE_PLUGIN_ID,
	resources: ecommerceResources,
});
export function useEcommerceEndpoint() {
	const { api, plugins } = useStack();
	const pluginApi = plugins?.[ECOMMERCE_PLUGIN_ID]?.api;
	const baseURL = pluginApi?.baseURL ?? api?.baseURL ?? "";
	const basePath = pluginApi?.basePath ?? api?.basePath ?? "";
	return useMemo(() => ({ baseURL, basePath }), [baseURL, basePath]);
}
export function useProducts(filters: ProductFilters = {}) {
	return ecommerce.ecommerceProducts.list.use([
		filters,
		useEcommerceEndpoint(),
	]);
}
export function useSuspenseProducts(filters: ProductFilters = {}) {
	return ecommerce.ecommerceProducts.list.useSuspense([
		filters,
		useEcommerceEndpoint(),
	]);
}
export function useProduct(slug: string) {
	return ecommerce.ecommerceProducts.detail.use([slug, useEcommerceEndpoint()]);
}
export function useSuspenseProduct(slug: string) {
	return ecommerce.ecommerceProducts.detail.useSuspense([
		slug,
		useEcommerceEndpoint(),
	]);
}
