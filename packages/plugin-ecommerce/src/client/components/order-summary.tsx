"use client";
import type { Order } from "../../types";
import { formatMoney } from "./storefront";
import { ProductImage } from "./product-image";

export function OrderSummary({ order }: { order: Order }) {
	return (
		<div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
			<section>
				<h2 className="text-xl font-medium">Items</h2>
				<ul className="mt-3 divide-y">
					{order.lineItems.map((item, index) => (
						<li
							key={`${item.productId}:${item.variantId ?? ""}:${index}`}
							className="flex items-center gap-4 py-4"
						>
							{item.image ? (
								<div className="h-16 w-16 shrink-0 overflow-hidden rounded-md">
									<ProductImage image={item.image} alt={item.name} />
								</div>
							) : null}
							<div className="flex-1">
								<p className="font-medium">{item.name}</p>
								{item.variantName ? (
									<p className="text-sm text-muted-foreground">
										{item.variantName}
									</p>
								) : null}
								<p className="mt-1 text-sm text-muted-foreground">
									Quantity {item.quantity}
								</p>
							</div>
							<span className="text-sm tabular-nums">
								{formatMoney(item.price * item.quantity, order.currency)}
							</span>
						</li>
					))}
				</ul>
			</section>
			<aside className="space-y-6 rounded-lg bg-muted/40 p-6">
				<div>
					<h2 className="font-medium">Order summary</h2>
					<dl className="mt-4 space-y-2 text-sm">
						<div className="flex justify-between">
							<dt>Subtotal</dt>
							<dd>{formatMoney(order.subtotal, order.currency)}</dd>
						</div>
						<div className="flex justify-between">
							<dt>Discount</dt>
							<dd>−{formatMoney(order.discount, order.currency)}</dd>
						</div>
						<div className="flex justify-between">
							<dt>Shipping</dt>
							<dd>{formatMoney(order.shipping, order.currency)}</dd>
						</div>
						<div className="flex justify-between">
							<dt>Tax</dt>
							<dd>{formatMoney(order.tax, order.currency)}</dd>
						</div>
						<div className="flex justify-between border-t pt-3 font-semibold">
							<dt>Total</dt>
							<dd>{formatMoney(order.total, order.currency)}</dd>
						</div>
					</dl>
				</div>
				<div>
					<h2 className="font-medium">Shipping address</h2>
					<address className="mt-3 text-sm not-italic leading-6 text-muted-foreground">
						{order.shippingAddress.name}
						<br />
						{order.shippingAddress.line1}
						<br />
						{order.shippingAddress.line2 ? (
							<>
								{order.shippingAddress.line2}
								<br />
							</>
						) : null}
						{order.shippingAddress.city}, {order.shippingAddress.region}{" "}
						{order.shippingAddress.postalCode}
						<br />
						{order.shippingAddress.country}
					</address>
				</div>
				<dl className="space-y-2 text-sm">
					<div>
						<dt className="text-muted-foreground">Email</dt>
						<dd className="break-all">{order.email}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Order status</dt>
						<dd className="capitalize">{order.status}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Payment status</dt>
						<dd className="capitalize">{order.paymentStatus}</dd>
					</div>
				</dl>
			</aside>
		</div>
	);
}
