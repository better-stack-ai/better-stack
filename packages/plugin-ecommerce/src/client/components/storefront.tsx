"use client";
import type { ReactNode } from "react";
import { useIdentity, usePluginSiteNavigation } from "@btst/stack/context";
import { ECOMMERCE_PLUGIN_ID } from "../constants";
import { useCart } from "../hooks/use-cart";
import { CartDrawer } from "./cart-drawer";

export function currencyScale(currency: string) {
	return (
		10 **
		(new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
		}).resolvedOptions().maximumFractionDigits ?? 2)
	);
}
export function formatMoney(amount: number, currency: string) {
	const formatter = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
	});
	return formatter.format(amount / currencyScale(currency));
}
export function Storefront({ children }: { children: ReactNode }) {
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	const { identity } = useIdentity();
	const cart = useCart();
	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-6 text-foreground sm:px-6 lg:px-8">
			<nav
				aria-label="Shop navigation"
				className="mb-10 flex flex-wrap items-center gap-5 border-b pb-5 text-sm"
			>
				<Link
					href={resolve("/shop").href}
					className="mr-auto text-lg font-semibold tracking-tight"
				>
					Shop
				</Link>
				{identity ? (
					<Link href={resolve("/shop/orders").href} className="hover:underline">
						My orders
					</Link>
				) : null}
				<Link href={resolve("/shop/cart").href} className="hover:underline">
					Review cart ({cart.count})
				</Link>
				<CartDrawer />
			</nav>
			{children}
		</main>
	);
}
export function ErrorMessage({ error }: { error: unknown }) {
	if (!error) return null;
	return (
		<p
			role="alert"
			className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
		>
			{error instanceof Error
				? error.message
				: "The request failed. Please try again."}
		</p>
	);
}
export function EmptyCart() {
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	return (
		<section className="py-16 text-center">
			<h1 className="text-2xl font-semibold">Your cart is empty</h1>
			<p className="mt-3 text-muted-foreground">
				Choose a product to start your order.
			</p>
			<Link
				className="mt-6 inline-block underline underline-offset-4"
				href={resolve("/shop").href}
			>
				Browse products
			</Link>
		</section>
	);
}
