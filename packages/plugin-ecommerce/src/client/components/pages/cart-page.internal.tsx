"use client";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { useCart } from "../../hooks/use-cart";
import { CartItems } from "../cart-items";
import { EmptyCart, Storefront, formatMoney } from "../storefront";

export function CartPage() {
	const cart = useCart();
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	return (
		<Storefront>
			{!cart.isHydrated ? (
				<p role="status">Loading cart…</p>
			) : cart.items.length ? (
				<>
					<h1 className="mb-8 text-3xl font-semibold tracking-tight">
						Your cart
					</h1>
					<div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
						<CartItems />
						<aside className="rounded-lg bg-muted/40 p-6">
							<h2 className="text-lg font-medium">Order summary</h2>
							<p className="mt-6 flex justify-between gap-4">
								<span>Subtotal</span>
								<strong className="tabular-nums">
									{formatMoney(cart.subtotal, cart.items[0]?.currency ?? "USD")}
								</strong>
							</p>
							<p className="mt-3 text-sm leading-6 text-muted-foreground">
								Discounts, shipping and final availability are confirmed at
								checkout.
							</p>
							{!cart.storageAvailable ? (
								<p role="status" className="mt-3 text-sm">
									Your browser could not save this cart. Keep this tab open
									until checkout.
								</p>
							) : null}
							<Button asChild className="mt-6 h-11 w-full">
								<Link href={resolve("/shop/checkout").href}>Checkout</Link>
							</Button>
						</aside>
					</div>
				</>
			) : (
				<EmptyCart />
			)}
		</Storefront>
	);
}
