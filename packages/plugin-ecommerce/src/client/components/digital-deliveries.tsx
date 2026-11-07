"use client";
import { useState } from "react";
import {
	PermissionAccess,
	useIdentity,
	useIdentitySourceGeneration,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { ecommercePermissions } from "../../permissions";
import type { Order } from "../../types";
import {
	useClaimGuestDeliveries,
	useDownloadOrderDelivery,
	useIssueGuestDeliveryToken,
	useRetryOrderDelivery,
} from "../hooks/use-orders";
import { ErrorMessage } from "./storefront";
import { useEcommerceEndpoint } from "../hooks/use-products";

type DigitalDeliveriesProps = {
	order: Order;
	admin?: boolean;
	onRefresh: () => Promise<unknown>;
};

export function DigitalDeliveries(props: DigitalDeliveriesProps) {
	const { identity } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const endpoint = useEcommerceEndpoint();
	return (
		<DigitalDeliveryPanel
			key={JSON.stringify([props.order.id, generation, identity?.id, endpoint])}
			{...props}
		/>
	);
}

function DigitalDeliveryPanel({
	order,
	admin = false,
	onRefresh,
}: DigitalDeliveriesProps) {
	const { identity } = useIdentity();
	const [token, setToken] = useState("");
	const download = useDownloadOrderDelivery();
	const retry = useRetryOrderDelivery();
	const claim = useClaimGuestDeliveries();
	const issueToken = useIssueGuestDeliveryToken();
	const grants = order.deliveryGrants ?? [];
	if (!grants.length) return null;
	return (
		<section className="mt-8 border-t pt-6" aria-label="Digital delivery">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-xl font-medium">Digital delivery</h2>
				<Button variant="outline" onClick={() => void onRefresh()}>
					Refresh delivery status
				</Button>
			</div>
			<ErrorMessage
				error={download.error ?? retry.error ?? claim.error ?? issueToken.error}
			/>
			<ul className="mt-3 divide-y">
				{grants.map((grant) => {
					const expired =
						grant.expiresAt !== null &&
						new Date(grant.expiresAt).getTime() <= Date.now();
					const canDownload = order.customerId
						? identity?.id === order.customerId
						: Boolean(token.trim());
					return (
						<li
							key={grant.id}
							className="flex flex-wrap items-center justify-between gap-4 py-4"
						>
							<div>
								<p className="font-medium">{grant.name}</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Quantity {grant.quantity} ·{" "}
									<span className="capitalize">
										{expired && grant.status === "active"
											? "expired"
											: grant.status}
									</span>
								</p>
								{grant.expiresAt ? (
									<p className="text-sm text-muted-foreground">
										Access expires {new Date(grant.expiresAt).toLocaleString()}
									</p>
								) : null}
								{admin && grant.lastError ? (
									<p className="mt-1 text-sm text-destructive">
										{grant.lastError}
									</p>
								) : null}
							</div>
							{admin ? (
								<PermissionAccess
									permission={ecommercePermissions.order.update({
										id: order.id,
									})}
								>
									{["pending", "processing", "failed", "revoking"].includes(
										grant.status,
									) ? (
										<Button
											variant="outline"
											disabled={retry.isPending}
											onClick={async () => {
												try {
													await retry.mutateAsync({
														id: order.id,
														grantId: grant.id,
													});
												} catch {
													/* The mutation error is shown above. */
												}
											}}
										>
											{retry.isPending ? "Retrying…" : "Retry delivery"}
										</Button>
									) : null}
								</PermissionAccess>
							) : grant.status === "active" && grant.downloadable ? (
								<Button
									disabled={download.isPending || expired || !canDownload}
									onClick={async () => {
										try {
											const result = await download.mutateAsync({
												id: order.id,
												grantId: grant.id,
												token: token.trim() || undefined,
											});
											const url = URL.createObjectURL(result.blob);
											const link = document.createElement("a");
											link.href = url;
											link.download = result.filename ?? grant.name;
											link.click();
											window.setTimeout(() => URL.revokeObjectURL(url), 1000);
										} catch {
											/* The mutation error is shown above. */
										}
									}}
								>
									{download.isPending ? "Preparing download…" : "Download"}
								</Button>
							) : null}
						</li>
					);
				})}
			</ul>
			{!order.customerId && !admin ? (
				<div className="mt-4 max-w-xl space-y-3">
					<label className="block text-sm">
						Guest delivery capability
						<input
							type="password"
							autoComplete="off"
							value={token}
							onChange={(event) => setToken(event.target.value)}
							className="mt-2 block h-10 w-full rounded-md border bg-background px-3"
						/>
					</label>
					<p className="text-sm text-muted-foreground">
						Enter the expiring capability supplied by the shop to download your
						purchase. Your order confirmation alone does not unlock downloads.
					</p>
					{identity ? (
						<Button
							variant="outline"
							disabled={!token.trim() || claim.isPending}
							onClick={async () => {
								try {
									await claim.mutateAsync({
										id: order.id,
										token: token.trim(),
									});
									setToken("");
									await onRefresh();
								} catch {
									/* The mutation error is shown above. */
								}
							}}
						>
							{claim.isPending ? "Claiming…" : "Claim delivery to my account"}
						</Button>
					) : (
						<p className="text-sm text-muted-foreground">
							Sign in to claim this delivery to your account.
						</p>
					)}
				</div>
			) : null}
			{admin && !order.customerId ? (
				<PermissionAccess
					permission={ecommercePermissions.order.update({ id: order.id })}
				>
					<div className="mt-4 max-w-xl space-y-3">
						<Button
							variant="outline"
							disabled={issueToken.isPending}
							onClick={async () => {
								try {
									await issueToken.mutateAsync({ id: order.id });
								} catch {
									/* The mutation error is shown above. */
								}
							}}
						>
							{issueToken.isPending
								? "Creating…"
								: "Create guest delivery capability"}
						</Button>
						{issueToken.data ? (
							<>
								<label className="block text-sm">
									Guest capability
									<input
										readOnly
										value={issueToken.data.token}
										className="mt-2 block h-10 w-full rounded-md border bg-background px-3"
										onFocus={(event) => event.target.select()}
									/>
								</label>
								<p className="text-sm text-muted-foreground">
									Share securely with the verified purchaser. Expires{" "}
									{new Date(issueToken.data.expiresAt).toLocaleString()}.
									Creating another capability replaces this one.
								</p>
							</>
						) : null}
					</div>
				</PermissionAccess>
			) : null}
		</section>
	);
}
