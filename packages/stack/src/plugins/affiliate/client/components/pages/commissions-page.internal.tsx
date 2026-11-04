"use client";

import { useState } from "react";
import {
	PermissionAccess,
	usePluginSiteNavigation,
	usePluginOverrides,
} from "@btst/stack/context";
import { affiliatePermissions } from "../../../permissions";
import { useCommissions, useUpdateCommission } from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import type { AffiliatePluginOverrides } from "../../overrides";
import {
	ActionNotice,
	AffiliatePage,
	Field,
	Pagination,
	Status,
	money,
	date,
	useAffiliateAction,
} from "../shared";

export function CommissionsPage() {
	const [status, setStatus] = useState("");
	const [affiliateId, setAffiliateId] = useState("");
	const [offset, setOffset] = useState(0);
	const { data } = useCommissions({
		status: status || undefined,
		affiliateId: affiliateId || undefined,
		offset,
		limit: 25,
	});
	const update = useUpdateCommission();
	const action = useAffiliateAction();
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	return (
		<AffiliatePage
			title={localization?.commissions ?? "Commissions"}
			description="Review attributed conversions before including commissions in a payout."
		>
			<ActionNotice {...action} />
			<div className="affiliate-toolbar">
				<Field label="Filter by status">
					<select
						value={status}
						onChange={(event) => {
							setStatus(event.target.value);
							setOffset(0);
						}}
					>
						<option value="">All statuses</option>
						<option value="pending">Pending</option>
						<option value="approved">Approved</option>
						<option value="paid">Paid</option>
						<option value="voided">Voided</option>
					</select>
				</Field>
				<Field label="Affiliate ID">
					<input
						value={affiliateId}
						onChange={(event) => {
							setAffiliateId(event.target.value);
							setOffset(0);
						}}
						placeholder="All affiliates"
					/>
				</Field>
			</div>
			{data.items.length === 0 ? (
				<p className="affiliate-empty">
					No commissions match. Commissions appear after an attributed
					conversion is recorded.
				</p>
			) : (
				<div
					className="affiliate-table-scroll"
					role="region"
					aria-label="Commissions"
					tabIndex={0}
				>
					<table>
						<caption className="affiliate-sr-only">
							Affiliate commission review
						</caption>
						<thead>
							<tr>
								<th>Affiliate / conversion</th>
								<th className="affiliate-number">Commission</th>
								<th>Status</th>
								<th>Created</th>
								<th>Review</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((commission) => (
								<tr key={commission.id}>
									<td>
										<Link
											href={
												resolve(
													"affiliate/admin/affiliates",
													encodeURIComponent(commission.affiliateId),
												).href
											}
										>
											{commission.affiliateId}
										</Link>
										<p className="affiliate-small affiliate-muted">
											{commission.conversionId}
										</p>
									</td>
									<td className="affiliate-number">
										{money(commission.amount, commission.currency)}
									</td>
									<td>
										<Status value={commission.status} />
										{commission.payoutId && (
											<p className="affiliate-small affiliate-muted">
												Included in payout
											</p>
										)}
									</td>
									<td>{date(commission.createdAt)}</td>
									<td>
										<PermissionAccess
											permission={affiliatePermissions.commission.update({
												commissionId: commission.id,
												affiliateId: commission.affiliateId,
												status: commission.status,
											})}
										>
											<div className="affiliate-actions">
												{commission.status === "pending" &&
													!commission.payoutId && (
														<button
															type="button"
															disabled={action.pending}
															aria-label={`Approve commission ${commission.id}`}
															onClick={() =>
																void action.run(async () => {
																	await update.mutateAsync({
																		id: commission.id,
																		status: "approved",
																	});
																}, "Commission approved")
															}
														>
															Approve
														</button>
													)}
												{["pending", "approved"].includes(commission.status) &&
													!commission.payoutId && (
														<button
															type="button"
															disabled={action.pending}
															aria-label={`Void commission ${commission.id}`}
															onClick={() =>
																void action.run(async () => {
																	await update.mutateAsync({
																		id: commission.id,
																		status: "voided",
																	});
																}, "Commission voided")
															}
														>
															Void
														</button>
													)}
											</div>
										</PermissionAccess>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</AffiliatePage>
	);
}
