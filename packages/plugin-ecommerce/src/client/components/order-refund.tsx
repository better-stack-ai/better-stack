"use client";
import { useState } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { ecommercePermissions } from "../../permissions";
import {
	useOrderRefund,
	useReconcileOrderRefund,
	useRefundOrder,
} from "../hooks/use-orders";
import { ErrorMessage, formatMoney } from "./storefront";

export function OrderRefund({
	id,
	onRefresh,
	needsDigitalRevocation,
}: {
	id: string;
	onRefresh: () => Promise<unknown>;
	needsDigitalRevocation: boolean;
}) {
	const refund = useOrderRefund(id);
	const initiate = useRefundOrder();
	const reconcile = useReconcileOrderRefund();
	const [confirming, setConfirming] = useState(false);
	const busy = initiate.isPending || reconcile.isPending;
	const attempt = refund.data?.attempt;
	const retryRevocation =
		attempt?.status === "confirmed" && needsDigitalRevocation;
	const amount = refund.data
		? formatMoney(refund.data.amount, refund.data.currency)
		: "";
	return (
		<section className="mt-8 space-y-4 border-t pt-6" aria-label="Refund">
			<h2 className="text-xl font-medium">Refund</h2>
			<p className="text-sm text-muted-foreground">
				Refunding money does not restock items, cancel the order, or change
				physical fulfillment. Verified refunds revoke digital access. Manage
				returns separately.
			</p>
			<ErrorMessage error={refund.error ?? initiate.error ?? reconcile.error} />
			{refund.isPending ? <p role="status">Loading refund status…</p> : null}
			{refund.isError ? (
				<Button variant="outline" onClick={() => refund.refetch()}>
					Reload refund status
				</Button>
			) : null}
			{refund.data ? (
				<>
					{attempt ? (
						<div className="space-y-3 text-sm" aria-live="polite">
							<p>
								Refund status:{" "}
								<strong className="capitalize">{attempt.status}</strong>
								{" · "}
								{formatMoney(attempt.amount, attempt.currency)}
							</p>
							{attempt.status === "uncertain" ||
							attempt.status === "pending" ? (
								<p>Check the provider status before taking further action.</p>
							) : null}
							{attempt.status === "failed" ? (
								<p>
									The provider reported a failed refund. Contact the provider to
									resolve it.
								</p>
							) : null}
							{attempt.refundRef ? (
								<p className="break-all text-muted-foreground">
									Provider reference: {attempt.refundRef}
								</p>
							) : null}
							<h3 className="font-medium">Refund history</h3>
							<ol className="space-y-2">
								{attempt.history.map((entry, index) => (
									<li
										key={`${entry.createdAt}:${index}`}
										className="flex flex-wrap gap-x-3 gap-y-1"
									>
										<span className="capitalize">{entry.status}</span>
										<time
											className="text-muted-foreground"
											dateTime={entry.createdAt}
										>
											{new Date(entry.createdAt).toLocaleString()}
										</time>
									</li>
								))}
							</ol>
						</div>
					) : null}
					{!refund.data.eligible && refund.data.unavailableReason ? (
						<p className="text-sm text-muted-foreground">
							{refund.data.unavailableReason}
						</p>
					) : null}
					{refund.data.eligible ? (
						<PermissionAccess
							permission={ecommercePermissions.order.refund({ id })}
						>
							<Button
								variant="destructive"
								disabled={busy || refund.isFetching}
								onClick={() => setConfirming(true)}
							>
								Refund full order ({amount})
							</Button>
							<Dialog
								open={confirming}
								onOpenChange={(open) => {
									if (!busy) setConfirming(open);
								}}
							>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Refund the full order?</DialogTitle>
										<DialogDescription>
											Send {amount} ({refund.data.currency}) back to the
											original payment. This cannot be undone. Items will not be
											restocked and physical fulfillment will not change.
											Verified refunds revoke digital access.
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<Button
											variant="outline"
											disabled={busy}
											onClick={() => setConfirming(false)}
										>
											Cancel
										</Button>
										<Button
											variant="destructive"
											disabled={busy || refund.isFetching}
											onClick={async () => {
												try {
													await initiate.mutateAsync(id);
												} catch {
													/* The mutation error is shown above. */
												} finally {
													setConfirming(false);
													await Promise.all([refund.refetch(), onRefresh()]);
												}
											}}
										>
											{initiate.isPending
												? "Requesting refund…"
												: `Confirm refund ${amount}`}
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</PermissionAccess>
					) : null}
					{attempt &&
					(retryRevocation ||
						(attempt.status !== "confirmed" && refund.data.supported)) ? (
						<PermissionAccess
							permission={ecommercePermissions.order.reconcileRefund({ id })}
						>
							<Button
								variant="outline"
								disabled={busy || refund.isFetching}
								onClick={async () => {
									try {
										await reconcile.mutateAsync(id);
									} catch {
										/* The mutation error is shown above. */
									} finally {
										await Promise.all([refund.refetch(), onRefresh()]);
									}
								}}
							>
								{reconcile.isPending
									? retryRevocation
										? "Retrying digital revocation…"
										: "Checking provider…"
									: retryRevocation
										? "Retry digital revocation"
										: "Check provider status"}
							</Button>
						</PermissionAccess>
					) : null}
				</>
			) : null}
		</section>
	);
}
