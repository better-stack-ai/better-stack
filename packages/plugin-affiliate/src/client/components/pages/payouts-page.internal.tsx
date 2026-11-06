"use client";

import { useState, type FormEvent } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { affiliatePermissions } from "../../../permissions";
import {
	useCreatePayout,
	usePayoutExport,
	usePayouts,
	useUpdatePayout,
} from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import type { AffiliatePluginOverrides } from "../../overrides";
import type { Payout } from "../../../types";
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

export function PayoutsPage() {
	const [status, setStatus] = useState("");
	const [offset, setOffset] = useState(0);
	const [affiliateId, setAffiliateId] = useState("");
	const [currency, setCurrency] = useState("USD");
	const [recording, setRecording] = useState<Payout | null>(null);
	const { data } = usePayouts({
		status: status || undefined,
		offset,
		limit: 25,
	});
	const exportCSV = usePayoutExport({ status: status || undefined });
	const create = useCreatePayout();
	const update = useUpdatePayout();
	const action = useAffiliateAction();
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void action.run(async () => {
			await create.mutateAsync({ affiliateId, currency });
		}, "Payout batch created. Arrange the payment, then record its result below.");
	};
	const record = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!recording) return;
		const fields = new FormData(event.currentTarget);
		const payout = recording;
		void action.run(async () => {
			await update.mutateAsync({
				id: payout.id,
				status: String(fields.get("status")) as "sent" | "failed",
				reference: String(fields.get("reference") ?? ""),
			});
			setRecording(null);
		}, "Payout result recorded");
	};
	return (
		<AffiliatePage
			title={localization?.payouts ?? "Payouts"}
			description="Group approved commissions, arrange payment, and record the result."
			action={
				<PermissionAccess permission={affiliatePermissions.payout.export()}>
					<button
						type="button"
						disabled={action.pending || exportCSV.isFetching}
						onClick={() =>
							void action.run(async () => {
								const result = await exportCSV.refetch();
								if (result.error) throw result.error;
								if (!result.data)
									throw new Error(
										"The payout CSV could not be exported. Try again.",
									);
								const url = URL.createObjectURL(
									new Blob([result.data.csv], {
										type: "text/csv;charset=utf-8",
									}),
								);
								const anchor = document.createElement("a");
								anchor.href = url;
								anchor.download = "affiliate-payouts.csv";
								anchor.click();
								URL.revokeObjectURL(url);
							}, "Payouts exported")
						}
					>
						Export CSV
					</button>
				</PermissionAccess>
			}
		>
			<ActionNotice {...action} />
			<form className="affiliate-panel affiliate-stack" onSubmit={save}>
				<h2>Create payout batch</h2>
				<p className="affiliate-muted">
					Includes all approved, unpaid commissions for one affiliate and
					currency. Payment is arranged manually.
				</p>
				<fieldset disabled={action.pending}>
					<div className="affiliate-form-grid">
						<Field label="Affiliate ID">
							<input
								value={affiliateId}
								onChange={(event) => setAffiliateId(event.target.value)}
								required
							/>
						</Field>
						<Field label="Currency">
							<input
								value={currency}
								onChange={(event) =>
									setCurrency(event.target.value.toUpperCase())
								}
								pattern="[A-Z]{3}"
								maxLength={3}
								minLength={3}
								required
							/>
						</Field>
					</div>
					<PermissionAccess
						permission={affiliatePermissions.payout.create({
							affiliateId,
							currency,
						})}
					>
						<button className="affiliate-primary" type="submit">
							{create.isPending ? "Creating…" : "Create payout batch"}
						</button>
					</PermissionAccess>
				</fieldset>
			</form>
			{recording && (
				<form className="affiliate-panel affiliate-stack" onSubmit={record}>
					<h2>Record payout result</h2>
					<p>
						{money(recording.amount, recording.currency)} for affiliate{" "}
						{recording.affiliateId}
					</p>
					<fieldset disabled={action.pending}>
						<div className="affiliate-form-grid">
							<Field label="Payment result">
								<select name="status" defaultValue="sent">
									<option value="sent">Sent</option>
									<option value="failed">Failed</option>
								</select>
							</Field>
							<Field label="Payment reference">
								<input
									name="reference"
									maxLength={1000}
									placeholder="Bank transfer or accounting reference"
								/>
							</Field>
						</div>
						<div className="affiliate-actions">
							<button className="affiliate-primary" type="submit">
								Save payout result
							</button>
							<button type="button" onClick={() => setRecording(null)}>
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
						<option value="sent">Sent</option>
						<option value="failed">Failed</option>
					</select>
				</Field>
			</div>
			{data.items.length === 0 ? (
				<p className="affiliate-empty">
					No payouts match. Create a batch when an affiliate has approved
					commissions.
				</p>
			) : (
				<div
					className="affiliate-table-scroll"
					role="region"
					aria-label="Payout history"
					tabIndex={0}
				>
					<table>
						<caption className="affiliate-sr-only">
							Manual affiliate payouts
						</caption>
						<thead>
							<tr>
								<th>Affiliate</th>
								<th className="affiliate-number">Amount</th>
								<th>Status</th>
								<th>Reference / date</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((payout) => (
								<tr key={payout.id}>
									<td>
										<Link
											href={
												resolve(
													"affiliate/admin/affiliates",
													encodeURIComponent(payout.affiliateId),
												).href
											}
										>
											{payout.affiliateId}
										</Link>
										<p className="affiliate-small affiliate-muted">
											{payout.id}
										</p>
									</td>
									<td className="affiliate-number">
										{money(payout.amount, payout.currency)}
									</td>
									<td>
										<Status value={payout.status} />
									</td>
									<td>
										{payout.reference || "No reference"}
										<p className="affiliate-small affiliate-muted">
											{date(payout.paidAt ?? payout.createdAt)}
										</p>
									</td>
									<td>
										{payout.status === "pending" && (
											<PermissionAccess
												permission={affiliatePermissions.payout.update({
													payoutId: payout.id,
													affiliateId: payout.affiliateId,
													status: payout.status,
												})}
											>
												<button
													type="button"
													disabled={action.pending}
													aria-label={`Record payout result ${payout.id}`}
													onClick={() => setRecording(payout)}
												>
													Record result
												</button>
											</PermissionAccess>
										)}
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
