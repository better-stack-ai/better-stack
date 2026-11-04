"use client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useCart } from "../hooks/use-cart";
import { ProductImage } from "./product-image";
import { formatMoney } from "./storefront";

export function CartItems() {
	const cart = useCart();
	return (
		<ul className="divide-y">
			{cart.items.map((item) => (
				<li
					key={`${item.productId}:${item.variantId ?? ""}`}
					className="flex gap-4 py-5"
				>
					<div className="h-20 w-20 shrink-0 overflow-hidden rounded-md">
						<ProductImage image={item.image} alt={item.name} />
					</div>
					<div className="min-w-0 flex-1">
						<p className="font-medium">{item.name}</p>
						{item.variantName ? (
							<p className="text-sm text-muted-foreground">
								{item.variantName}
							</p>
						) : null}
						<p className="mt-1 text-sm">
							{formatMoney(item.price, item.currency)}
						</p>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<label className="flex items-center gap-2 text-sm">
								Quantity
								<span className="sr-only">
									{" "}
									for {item.name}
									{item.variantName ? ` ${item.variantName}` : ""}
								</span>
								<Input
									className="w-20"
									type="number"
									min={1}
									max={99}
									value={item.quantity}
									onChange={(event) =>
										cart.updateQuantity(
											item.productId,
											item.variantId,
											Number(event.target.value),
										)
									}
								/>
							</label>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => cart.removeItem(item.productId, item.variantId)}
								aria-label={`Remove ${item.name}${item.variantName ? ` ${item.variantName}` : ""}`}
							>
								Remove
							</Button>
						</div>
					</div>
					<p className="text-sm font-medium tabular-nums">
						{formatMoney(item.price * item.quantity, item.currency)}
					</p>
				</li>
			))}
		</ul>
	);
}
