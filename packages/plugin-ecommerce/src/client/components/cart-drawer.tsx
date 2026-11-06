"use client";
import { useState } from "react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { ECOMMERCE_PLUGIN_ID } from "../constants";
import { useCart } from "../hooks/use-cart";
import { CartItems } from "./cart-items";

export function CartDrawer() {
	const [open, setOpen] = useState(false);
	const cart = useCart();
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="outline" size="sm">
					Open cart
				</Button>
			</SheetTrigger>
			<SheetContent className="flex flex-col">
				<SheetHeader>
					<SheetTitle>Your cart ({cart.count})</SheetTitle>
					<SheetDescription>
						Review quantities before checkout. Prices and availability are
						confirmed at checkout.
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-auto px-4">
					{cart.items.length ? (
						<CartItems />
					) : (
						<p className="py-8 text-muted-foreground">Your cart is empty.</p>
					)}
				</div>
				{cart.items.length ? (
					<div className="border-t p-4">
						<Button asChild className="w-full">
							<Link
								href={resolve("/shop/cart").href}
								onClick={() => setOpen(false)}
							>
								Review cart
							</Link>
						</Button>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
}
