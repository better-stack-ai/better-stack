"use client";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { ecommerce, useEcommerceEndpoint } from "./use-products";
import { createApiClient } from "@btst/stack/plugins/client";
import { useQueryClient } from "@tanstack/react-query";
import { createEcommerceQueryKeys, type OrderFilters } from "../../query-keys";
import type { EcommerceApiRouter } from "../../api/plugin";
import { ECOMMERCE_PLUGIN_ID } from "../constants";

function useOrderScope() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const endpoint = useEcommerceEndpoint();
	return {
		identity: isPending
			? `pending:${generation}`
			: error
				? `error:${generation}`
				: identity,
		endpoint,
	};
}
export function useOrders(filters: OrderFilters = {}) {
	const scope = useOrderScope();
	return ecommerce.ecommerceOrders.list.use([filters, scope], {
		enabled: typeof scope.identity !== "string",
	});
}
export function useOrder(id: string) {
	const scope = useOrderScope();
	return ecommerce.ecommerceOrders.detail.use([id, scope], {
		enabled: typeof scope.identity !== "string",
	});
}
export function useMyOrders(filters: OrderFilters = {}) {
	const scope = useOrderScope();
	return ecommerce.ecommerceOrders.mine.use([filters, scope], {
		enabled: scope.identity !== null && typeof scope.identity !== "string",
	});
}
export function useOrderConfirmation(id: string, token: string) {
	return ecommerce.ecommerceOrders.confirmation.use(
		[id, token, useEcommerceEndpoint()],
		{ enabled: Boolean(token) },
	);
}
export const useCheckout = () => ecommerce.ecommerceOrders.checkout.use();
export const useUpdateOrderStatus = () =>
	ecommerce.ecommerceOrders.updateStatus.use();
export const useValidateDiscount = () =>
	ecommerce.ecommerceOrders.validateDiscount.use();

/** Fresh authenticated confirmation reads used before reusing a checkout attempt. */
export function useVerifyCheckoutOrder() {
	const { plugins, queryClient: stackQueryClient } = useStack();
	const endpoint = useEcommerceEndpoint();
	const runtime = plugins?.[ECOMMERCE_PLUGIN_ID]?.api;
	const queryClient = useQueryClient(stackQueryClient);
	const queries = createEcommerceQueryKeys(
		createApiClient<EcommerceApiRouter>({
			...endpoint,
			headers: runtime?.browserHeaders,
			credentials: runtime?.credentials,
		}),
	);
	return (id: string, token: string) => {
		if (!token)
			return Promise.reject(
				new Error(
					"Your previous order needs secure access before retrying payment. Open its confirmation page or contact the shop.",
				),
			);
		return queryClient.fetchQuery({
			...queries.ecommerceOrders.confirmation(id, token, endpoint),
			staleTime: 0,
			retry: false,
		});
	};
}
