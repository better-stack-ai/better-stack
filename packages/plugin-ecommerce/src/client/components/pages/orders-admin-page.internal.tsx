"use client";
import { useState } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { useIdentity, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/tabs";
import { DiscountCodes } from "../discount-codes";
import type { OrderStatus, OrdersPage } from "../../../types";
import { useMyOrders, useOrders } from "../../hooks/use-orders";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { ErrorMessage, Storefront, formatMoney } from "../storefront";

function OrdersTable({
	data,
	admin = false,
}: {
	data?: OrdersPage;
	admin?: boolean;
}) {
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	if (!data?.items.length)
		return <p className="py-12 text-muted-foreground">No orders yet.</p>;
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-left text-sm">
				<caption className="sr-only">
					{admin ? "All customer orders" : "Your orders"}
				</caption>
				<thead className="border-b text-muted-foreground">
					<tr>
						<th scope="col" className="py-3 pr-4 font-medium">
							Order
						</th>
						<th scope="col" className="py-3 pr-4 font-medium">
							Date
						</th>
						{admin ? (
							<th scope="col" className="py-3 pr-4 font-medium">
								Customer
							</th>
						) : null}
						<th scope="col" className="py-3 pr-4 font-medium">
							Status
						</th>
						<th scope="col" className="py-3 pr-4 font-medium">
							Payment
						</th>
						<th scope="col" className="py-3 text-right font-medium">
							Total
						</th>
					</tr>
				</thead>
				<tbody className="divide-y">
					{data.items.map((order) => (
						<tr key={order.id}>
							<td className="py-4 pr-4">
								{admin ? (
									<Link
										className="font-medium underline underline-offset-4"
										href={
											resolve(
												`/shop/admin/orders/${encodeURIComponent(order.id)}`,
											).href
										}
									>
										{order.id.slice(0, 12)}
									</Link>
								) : (
									<span>{order.id.slice(0, 12)}</span>
								)}
							</td>
							<td className="whitespace-nowrap py-4 pr-4">
								{new Date(order.createdAt).toLocaleDateString()}
							</td>
							{admin ? <td className="py-4 pr-4">{order.email}</td> : null}
							<td className="py-4 pr-4 capitalize">{order.status}</td>
							<td className="py-4 pr-4 capitalize">{order.paymentStatus}</td>
							<td className="py-4 text-right tabular-nums">
								{formatMoney(order.total, order.currency)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
export function OrdersAdminPage() {
	const [status, setStatus] = useState<OrderStatus | "">("");
	const [offset, setOffset] = useState(0);
	const orders = useOrders({ status: status || undefined, limit: 25, offset });
	useRegisterPageAIContext(
		orders.data
			? {
					routeName: "ecommerce-orders-admin",
					pageDescription: JSON.stringify({
						page: "Read-only Ecommerce administration summary. No mutation tools are available.",
						statusFilter: status || "all",
						offset,
						totalOrders: orders.data.total,
						visibleOrders: orders.data.items.length,
						visiblePaidOrders: orders.data.items.filter(
							(order) => order.paymentStatus === "paid",
						).length,
					}),
				}
			: null,
	);
	return (
		<Storefront>
			<Tabs defaultValue="orders">
				<TabsList className="mb-6" aria-label="Ecommerce administration">
					<TabsTrigger value="orders">Orders</TabsTrigger>
					<TabsTrigger value="discounts">Discount Codes</TabsTrigger>
				</TabsList>
				<TabsContent value="orders">
					<header className="mb-8 flex flex-wrap items-end justify-between gap-4">
						<div>
							<h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
							<p className="mt-2 text-muted-foreground">
								Track payments and fulfilment.
							</p>
						</div>
						<label className="text-sm">
							Order status
							<select
								className="ml-3 h-9 rounded-md border bg-background px-3"
								value={status}
								onChange={(event) => {
									setStatus(event.target.value as OrderStatus | "");
									setOffset(0);
								}}
							>
								<option value="">All statuses</option>
								{[
									"pending",
									"paid",
									"fulfilling",
									"fulfilled",
									"cancelled",
								].map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
					</header>
					<ErrorMessage error={orders.error} />
					{orders.isPending ? (
						<p role="status">Loading orders…</p>
					) : (
						<OrdersTable data={orders.data} admin />
					)}
					{orders.data && orders.data.total > 25 ? (
						<nav aria-label="Order pages" className="mt-6 flex justify-between">
							<Button
								variant="outline"
								disabled={offset === 0}
								onClick={() => setOffset(Math.max(0, offset - 25))}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								disabled={offset + 25 >= orders.data.total}
								onClick={() => setOffset(offset + 25)}
							>
								Next
							</Button>
						</nav>
					) : null}
				</TabsContent>
				<TabsContent value="discounts">
					<DiscountCodes />
				</TabsContent>
			</Tabs>
		</Storefront>
	);
}
export function MyOrdersPage() {
	const { identity, isPending } = useIdentity();
	const [offset, setOffset] = useState(0);
	const orders = useMyOrders({ limit: 25, offset });
	return (
		<Storefront>
			<h1 className="mb-8 text-3xl font-semibold tracking-tight">My orders</h1>
			{isPending ? (
				<p role="status">Loading your account…</p>
			) : !identity ? (
				<p className="text-muted-foreground">Sign in to see your orders.</p>
			) : (
				<>
					<ErrorMessage error={orders.error} />
					{orders.isPending ? (
						<p role="status">Loading orders…</p>
					) : (
						<OrdersTable data={orders.data} />
					)}
					{orders.data && orders.data.total > 25 ? (
						<nav
							aria-label="Your order pages"
							className="mt-6 flex justify-between"
						>
							<Button
								variant="outline"
								disabled={offset === 0}
								onClick={() => setOffset(Math.max(0, offset - 25))}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								disabled={offset + 25 >= orders.data.total}
								onClick={() => setOffset(offset + 25)}
							>
								Next
							</Button>
						</nav>
					) : null}
				</>
			)}
		</Storefront>
	);
}
