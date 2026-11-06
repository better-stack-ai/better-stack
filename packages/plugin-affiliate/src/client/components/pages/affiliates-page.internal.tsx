"use client";

import { useState, type FormEvent } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { affiliatePermissions } from "../../../permissions";
import type { AffiliateStatus } from "../../../types";
import {
	useAffiliates,
	useCreateAffiliate,
	useUpdateAffiliate,
} from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import type { AffiliatePluginOverrides } from "../../overrides";
import {
	ActionNotice,
	AffiliatePage,
	Field,
	Pagination,
	ProfileFields,
	readProfile,
	Status,
	useAffiliateAction,
	date,
} from "../shared";

export function AffiliatesPage() {
	const [status, setStatus] = useState("");
	const [offset, setOffset] = useState(0);
	const [adding, setAdding] = useState(false);
	const { data } = useAffiliates({
		status: status || undefined,
		limit: 25,
		offset,
	});
	const create = useCreateAffiliate();
	const update = useUpdateAffiliate();
	const action = useAffiliateAction();
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			await create.mutateAsync({
				...readProfile(fields),
				userId: String(fields.get("userId") ?? ""),
			});
			setAdding(false);
		}, "Affiliate added. Review the profile to approve the application.");
	};
	return (
		<AffiliatePage
			title={localization?.affiliates ?? "Affiliates"}
			description="Review applications, approve partners, and manage referral profiles."
			action={
				<PermissionAccess permission={affiliatePermissions.affiliate.create()}>
					<button
						className="affiliate-primary"
						type="button"
						onClick={() => setAdding(!adding)}
					>
						{adding ? "Close form" : "Add affiliate"}
					</button>
				</PermissionAccess>
			}
		>
			<ActionNotice {...action} />
			{adding && (
				<form className="affiliate-panel affiliate-stack" onSubmit={save}>
					<h2>Add affiliate</h2>
					<fieldset disabled={action.pending}>
						<ProfileFields userId />
						<div className="affiliate-actions">
							<button className="affiliate-primary" type="submit">
								{action.pending ? "Saving…" : "Save affiliate"}
							</button>
							<button type="button" onClick={() => setAdding(false)}>
								Cancel
							</button>
						</div>
					</fieldset>
				</form>
			)}
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
						<option value="suspended">Suspended</option>
					</select>
				</Field>
				<p className="affiliate-muted">
					{data.total} {data.total === 1 ? "affiliate" : "affiliates"}
				</p>
			</div>
			{data.items.length === 0 ? (
				<p className="affiliate-empty">
					No affiliates match. Add an affiliate or adjust the status filter.
				</p>
			) : (
				<div
					className="affiliate-table-scroll"
					role="region"
					aria-label="Affiliates"
					tabIndex={0}
				>
					<table>
						<caption className="affiliate-sr-only">
							Affiliate applications and profiles
						</caption>
						<thead>
							<tr>
								<th>Name</th>
								<th>Referral code</th>
								<th>Status</th>
								<th>Applied</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((affiliate) => (
								<tr key={affiliate.id}>
									<td>
										<Link
											className="affiliate-record-link"
											href={
												resolve(
													"affiliate/admin/affiliates",
													encodeURIComponent(affiliate.id),
												).href
											}
										>
											{affiliate.name}
										</Link>
										<p className="affiliate-small affiliate-muted">
											{affiliate.email}
										</p>
									</td>
									<td>{affiliate.code}</td>
									<td>
										<Status value={affiliate.status} />
									</td>
									<td>{date(affiliate.createdAt)}</td>
									<td>
										<PermissionAccess
											permission={affiliatePermissions.affiliate.update({
												affiliateId: affiliate.id,
												userId: affiliate.userId,
												status: affiliate.status,
											})}
										>
											<button
												type="button"
												disabled={action.pending}
												aria-label={`${affiliate.status === "approved" ? "Suspend" : "Approve"} ${affiliate.name}`}
												onClick={() =>
													void action.run(
														async () => {
															await update.mutateAsync({
																id: affiliate.id,
																data: {
																	status: (affiliate.status === "approved"
																		? "suspended"
																		: "approved") as AffiliateStatus,
																},
															});
														},
														affiliate.status === "approved"
															? "Affiliate suspended"
															: "Affiliate approved",
													)
												}
											>
												{affiliate.status === "approved"
													? "Suspend"
													: "Approve"}
											</button>
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
