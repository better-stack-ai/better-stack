"use client";
import { useEffect, useState } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { useEcommerceEndpoint } from "../../hooks/use-products";
import { useOrderConfirmation } from "../../hooks/use-orders";
import { useCart } from "../../hooks/use-cart";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { ErrorMessage, Storefront, formatMoney } from "../storefront";
import { OrderSummary } from "../order-summary";
import { orderTokenKey } from "../../order-access";

export function OrderConfirmationPage({ id }: { id: string }) {
	const [token, setToken] = useState("");
	const [loaded, setLoaded] = useState(false);
	const cart = useCart();
	const endpoint = useEcommerceEndpoint();
	useEffect(() => {
		try {
			setToken(sessionStorage.getItem(orderTokenKey(id, endpoint)) ?? "");
		} catch {
			setToken("");
		}
		setLoaded(true);
	}, [id, endpoint]);
	const order = useOrderConfirmation(id, token);
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	useEffect(() => {
		if (
			!order.data ||
			order.data.paymentStatus !== "pending" ||
			order.data.status === "cancelled"
		)
			return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === "visible") void order.refetch();
		}, 2500);
		return () => window.clearInterval(timer);
	}, [order.data?.paymentStatus, order.data?.status, order.refetch]);
	useEffect(() => {
		if (!order.data || order.data.paymentStatus !== "paid") return;
		try {
			const snapshot = sessionStorage.getItem(
				`${orderTokenKey(id, endpoint)}:cart`,
			);
			if (
				snapshot ===
				JSON.stringify(
					cart.items.map(({ productId, variantId, quantity }) => ({
						productId,
						variantId,
						quantity,
					})),
				)
			) {
				cart.clear();
				sessionStorage.removeItem(`${orderTokenKey(id, endpoint)}:cart`);
			}
		} catch {
			/* Cart cleanup is optional when browser storage is unavailable. */
		}
	}, [id, endpoint, order.data?.paymentStatus, cart]);
	const paid = order.data?.paymentStatus === "paid";
	return (
		<Storefront>
			{loaded && !token ? (
				<section className="py-12">
					<h1 className="text-2xl font-semibold">Order access required</h1>
					<p className="mt-3 text-muted-foreground">
						Open this page in the browser where you checked out, or contact the
						shop with your order number.
					</p>
				</section>
			) : (
				<>
					<header className="mb-8">
						<p className="mb-3 text-sm text-muted-foreground">Order {id}</p>
						<h1 className="text-3xl font-semibold tracking-tight">
							{paid
								? "Payment confirmed"
								: order.data?.status === "cancelled"
									? "Order cancelled"
									: order.data?.paymentStatus === "failed"
										? "Payment was not completed"
										: order.data?.paymentStatus === "refunded"
											? "Payment refunded"
											: "Waiting for payment confirmation"}
						</h1>
						<p className="mt-3 max-w-xl text-muted-foreground">
							{paid
								? `Your payment of ${formatMoney(order.data?.total ?? 0, order.data?.currency ?? "USD")} is confirmed.`
								: order.data?.status === "cancelled"
									? "This order was cancelled. Your cart is available if you would like to start again."
									: order.data?.paymentStatus === "failed"
										? "Your payment did not complete. Return to checkout to try again."
										: order.data?.paymentStatus === "refunded"
											? "Your payment provider has reported a refund for this order."
											: "Your order is confirmed only after the payment provider sends a verified payment notification."}
						</p>
					</header>
					<ErrorMessage error={order.error} />
					{order.isFetching && !order.data ? (
						<p role="status">Loading order…</p>
					) : null}
					{order.data ? <OrderSummary order={order.data} /> : null}
					{!paid ? (
						<Button
							variant="outline"
							className="mt-6"
							disabled={order.isFetching}
							onClick={() => void order.refetch()}
						>
							Refresh payment status
						</Button>
					) : null}
				</>
			)}
			<Link
				className="mt-8 inline-block text-sm underline underline-offset-4"
				href={resolve("/shop").href}
			>
				Continue shopping
			</Link>
		</Storefront>
	);
}
