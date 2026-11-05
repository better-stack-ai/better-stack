"use client";
import { lazy } from "react";
import type { FallbackProps } from "react-error-boundary";
import { ComposedRoute } from "@btst/stack/client/components";
import { ecommercePermissions } from "../../../permissions";

const ProductList = lazy(() =>
	import("./product-list-page.internal").then((module) => ({
		default: module.ProductListPage,
	})),
);
const ProductDetail = lazy(() =>
	import("./product-detail-page.internal").then((module) => ({
		default: module.ProductDetailPage,
	})),
);
const Cart = lazy(() =>
	import("./cart-page.internal").then((module) => ({
		default: module.CartPage,
	})),
);
const Checkout = lazy(() =>
	import("./checkout-page.internal").then((module) => ({
		default: module.CheckoutPage,
	})),
);
const Confirmation = lazy(() =>
	import("./order-confirmation-page.internal").then((module) => ({
		default: module.OrderConfirmationPage,
	})),
);
const Orders = lazy(() =>
	import("./orders-admin-page.internal").then((module) => ({
		default: module.OrdersAdminPage,
	})),
);
const OrderDetail = lazy(() =>
	import("./order-detail-page.internal").then((module) => ({
		default: module.OrderDetailPage,
	})),
);
const MyOrders = lazy(() =>
	import("./orders-admin-page.internal").then((module) => ({
		default: module.MyOrdersPage,
	})),
);
function Loading() {
	return (
		<p className="p-8 text-sm text-muted-foreground" role="status">
			Loading shop…
		</p>
	);
}
function RouteError({ error }: FallbackProps) {
	return (
		<div className="mx-auto max-w-3xl p-8">
			<h1 className="text-xl font-semibold">Unable to load this page</h1>
			<p className="mt-3 text-sm text-destructive" role="alert">
				{error instanceof Error ? error.message : "Please try again."}
			</p>
		</div>
	);
}
function NotFound() {
	return <p className="p-8">This product or order could not be found.</p>;
}
const common = {
	ErrorComponent: RouteError,
	LoadingComponent: Loading,
	NotFoundComponent: NotFound,
	onError: (error: Error) =>
		console.error("[btst/ecommerce] Page error", error),
};
export function ProductListPageComponent() {
	return <ComposedRoute {...common} path="/shop" PageComponent={ProductList} />;
}
export function ProductDetailPageComponent({ slug }: { slug: string }) {
	return (
		<ComposedRoute
			{...common}
			path={`/shop/products/${slug}`}
			PageComponent={ProductDetail}
			props={{ slug }}
		/>
	);
}
export function CartPageComponent() {
	return <ComposedRoute {...common} path="/shop/cart" PageComponent={Cart} />;
}
export function CheckoutPageComponent() {
	return (
		<ComposedRoute {...common} path="/shop/checkout" PageComponent={Checkout} />
	);
}
export function OrderConfirmationPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...common}
			path={`/shop/orders/${id}/confirmation`}
			PageComponent={Confirmation}
			props={{ id }}
		/>
	);
}
export function OrdersAdminPageComponent() {
	return (
		<ComposedRoute
			{...common}
			path="/shop/admin/orders"
			permission={ecommercePermissions.order.read({})}
			PageComponent={Orders}
		/>
	);
}
export function OrderDetailPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...common}
			path={`/shop/admin/orders/${id}`}
			permission={ecommercePermissions.order.read({ id })}
			PageComponent={OrderDetail}
			props={{ id }}
		/>
	);
}
export function MyOrdersPageComponent() {
	return (
		<ComposedRoute
			{...common}
			path="/shop/orders"
			permission={ecommercePermissions.order.own({ customerId: "self" })}
			PageComponent={MyOrders}
		/>
	);
}
