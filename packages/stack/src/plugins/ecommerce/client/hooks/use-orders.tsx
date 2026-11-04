"use client";
import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { ecommerce, useEcommerceEndpoint } from "./use-products";
import type { OrderFilters } from "../../query-keys";

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
