"use client";
import { useState } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { ecommercePermissions } from "../../../permissions";
import type { OrderStatus } from "../../../types";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { useOrder, useUpdateOrderStatus } from "../../hooks/use-orders";
import { ErrorMessage, Storefront } from "../storefront";
import { OrderSummary } from "../order-summary";
import { OrderRefund } from "../order-refund";
import { DigitalDeliveries } from "../digital-deliveries";

const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
	pending: ["cancelled"],
	paid: ["fulfilling", "cancelled"],
	fulfilling: ["fulfilled", "cancelled"],
	fulfilled: [],
	cancelled: [],
};
export function OrderDetailPage({ id }: { id: string }) {
	const order = useOrder(id);
	const update = useUpdateOrderStatus();
	const [status, setStatus] = useState<OrderStatus | "">("");
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	return (
		<Storefront>
			<Link
				href={resolve("/shop/admin/orders").href}
				className="mb-6 inline-block text-sm underline underline-offset-4"
			>
				All orders
			</Link>
			<h1 className="mb-8 break-all text-2xl font-semibold tracking-tight">
				Order {id}
			</h1>
			<ErrorMessage error={order.error ?? update.error} />
			{order.isPending ? <p role="status">Loading order…</p> : null}
			{order.data ? (
				<>
					<OrderSummary order={order.data} />
					<PermissionAccess
						permission={ecommercePermissions.order.readRefund({ id })}
					>
						<OrderRefund
							key={`refund:${id}`}
							id={id}
							onRefresh={order.refetch}
						/>
					</PermissionAccess>
					<DigitalDeliveries
						key={id}
						order={order.data}
						admin
						onRefresh={order.refetch}
					/>
					{nextStatuses[order.data.status].length ? (
						<PermissionAccess
							permission={ecommercePermissions.order.update({ id })}
						>
							<form
								className="mt-8 flex flex-wrap items-end gap-3 border-t pt-6"
								onSubmit={async (event) => {
									event.preventDefault();
									if (!status) return;
									try {
										await update.mutateAsync({ id, status });
										setStatus("");
										await order.refetch();
									} catch {
										/* The mutation error is shown above. */
									}
								}}
							>
								<label className="text-sm">
									Update order status
									<select
										className="mt-2 block h-10 rounded-md border bg-background px-3"
										value={status}
										onChange={(event) =>
											setStatus(event.target.value as OrderStatus | "")
										}
									>
										<option value="">Choose status</option>
										{nextStatuses[order.data.status].map((value) => (
											<option key={value} value={value}>
												{value}
											</option>
										))}
									</select>
								</label>
								<Button type="submit" disabled={!status || update.isPending}>
									{update.isPending ? "Saving…" : "Save status"}
								</Button>
							</form>
						</PermissionAccess>
					) : null}
				</>
			) : null}
		</Storefront>
	);
}
