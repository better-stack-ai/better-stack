"use client";

import { useState, type FormEvent } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { affiliatePermissions } from "../../../permissions";
import {
	useAffiliateDashboard,
	useReferralLink,
	useUpdateAffiliateProfile,
} from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import type { AffiliatePluginOverrides } from "../../overrides";
import {
	ActionNotice,
	AffiliatePage,
	Field,
	ProfileFields,
	readProfile,
	Stats,
	Status,
	date,
	money,
	useAffiliateAction,
} from "../shared";

function assetHref(value: string) {
	try {
		const url = new URL(value, window.location.origin);
		return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
	} catch {
		return undefined;
	}
}

export function AffiliatePortalPage() {
	const { data } = useAffiliateDashboard();
	const [landingPath, setLandingPath] = useState("/");
	const [link, setLink] = useState("");
	const [editing, setEditing] = useState(false);
	const createLink = useReferralLink();
	const update = useUpdateAffiliateProfile();
	const action = useAffiliateAction();
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	const { affiliate, stats, commissions, payouts, assets } = data;
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			await update.mutateAsync(readProfile(fields));
			setEditing(false);
			setLink("");
		}, "Profile saved");
	};
	if (!affiliate)
		return (
			<AffiliatePage
				title={localization?.portal ?? "Affiliate portal"}
				admin={false}
			>
				<section className="affiliate-stack">
					<h2>Start with an affiliate application</h2>
					<p>
						Apply to receive a referral code and track your commissions here.
					</p>
					<div>
						<Link
							className="affiliate-primary"
							href={resolve("affiliate/apply").href}
						>
							Apply to become an affiliate
						</Link>
					</div>
				</section>
			</AffiliatePage>
		);
	return (
		<AffiliatePage
			title={localization?.portal ?? "Affiliate portal"}
			description={`Referral activity and earnings for ${affiliate.name}.`}
			admin={false}
			action={<Status value={affiliate.status} />}
		>
			<ActionNotice {...action} />
			{affiliate.status !== "approved" && (
				<p className="affiliate-notice">
					{affiliate.status === "pending"
						? "Your application is pending review. Referral tracking starts after approval."
						: "Your affiliate account is suspended. New referrals are not attributed. Contact the program administrator for help."}
				</p>
			)}
			<Stats stats={stats} />
			<section className="affiliate-section affiliate-stack">
				<h2>Your referral link</h2>
				<p className="affiliate-muted">
					Code: <strong>{affiliate.code}</strong>. Choose a landing page on this
					site. Visits through your link are recorded before the visitor reaches
					that page.
				</p>
				<form
					className="affiliate-toolbar"
					onSubmit={(event) => {
						event.preventDefault();
						void action.run(async () => {
							const next = createLink(affiliate.code, landingPath);
							setLink(next);
						}, "Referral link generated");
					}}
				>
					<Field
						label="Landing page path"
						hint="For example, /pricing or /products?category=books."
					>
						<input
							value={landingPath}
							onChange={(event) => {
								setLandingPath(event.target.value);
								setLink("");
							}}
							required
							placeholder="/pricing"
						/>
					</Field>
					<button
						type="submit"
						className="affiliate-primary"
						disabled={affiliate.status !== "approved"}
					>
						Generate referral link
					</button>
				</form>
				{link && (
					<div className="affiliate-toolbar">
						<Field label="Tracking link">
							<input
								readOnly
								value={link}
								onFocus={(event) => event.target.select()}
							/>
						</Field>
						<button
							type="button"
							onClick={() =>
								void action.run(async () => {
									await navigator.clipboard.writeText(link);
								}, "Referral link copied")
							}
						>
							Copy referral link
						</button>
					</div>
				)}
			</section>
			{assets.length > 0 && (
				<section className="affiliate-section affiliate-stack">
					<h2>Marketing assets</h2>
					<ul className="affiliate-assets">
						{assets.map((asset) => (
							<li key={`${asset.name}-${asset.url}`}>
								<strong>{asset.name}</strong>
								{asset.description && (
									<p className="affiliate-muted">{asset.description}</p>
								)}
								<div className="affiliate-actions">
									{assetHref(asset.url) && (
										<a
											href={assetHref(asset.url)}
											target="_blank"
											rel="noreferrer"
										>
											Open link template
										</a>
									)}
									{asset.bannerUrl && assetHref(asset.bannerUrl) && (
										<a
											href={assetHref(asset.bannerUrl)}
											target="_blank"
											rel="noreferrer"
										>
											Open banner
										</a>
									)}
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
			<section className="affiliate-section affiliate-stack">
				<h2>Commissions</h2>
				{commissions.length === 0 ? (
					<p className="affiliate-muted">
						Your commissions will appear after an attributed conversion.
					</p>
				) : (
					<div
						className="affiliate-table-scroll"
						role="region"
						aria-label="Your commissions"
						tabIndex={0}
					>
						<table>
							<caption className="affiliate-sr-only">
								Your commission history
							</caption>
							<thead>
								<tr>
									<th>Date</th>
									<th>Conversion</th>
									<th className="affiliate-number">Amount</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{commissions.map((commission) => (
									<tr key={commission.id}>
										<td>{date(commission.createdAt)}</td>
										<td>{commission.conversionId}</td>
										<td className="affiliate-number">
											{money(commission.amount, commission.currency)}
										</td>
										<td>
											<Status value={commission.status} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
			<section className="affiliate-section affiliate-stack">
				<h2>Payout history</h2>
				{payouts.length === 0 ? (
					<p className="affiliate-muted">
						Payouts appear when the program administrator creates a payment
						batch.
					</p>
				) : (
					<div
						className="affiliate-table-scroll"
						role="region"
						aria-label="Your payouts"
						tabIndex={0}
					>
						<table>
							<caption className="affiliate-sr-only">
								Your payout history
							</caption>
							<thead>
								<tr>
									<th>Date</th>
									<th className="affiliate-number">Amount</th>
									<th>Status</th>
									<th>Reference</th>
								</tr>
							</thead>
							<tbody>
								{payouts.map((payout) => (
									<tr key={payout.id}>
										<td>{date(payout.paidAt ?? payout.createdAt)}</td>
										<td className="affiliate-number">
											{money(payout.amount, payout.currency)}
										</td>
										<td>
											<Status value={payout.status} />
										</td>
										<td>{payout.reference || "No reference"}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
			<PermissionAccess permission={affiliatePermissions.portal.update()}>
				<section className="affiliate-section affiliate-stack">
					<div className="affiliate-section-heading">
						<div>
							<h2>Profile and payout details</h2>
							<p className="affiliate-muted">{affiliate.email}</p>
						</div>
						<button type="button" onClick={() => setEditing(!editing)}>
							{editing ? "Close profile" : "Edit profile"}
						</button>
					</div>
					{editing && (
						<form
							key={affiliate.updatedAt}
							className="affiliate-stack"
							onSubmit={save}
						>
							<fieldset disabled={action.pending}>
								<ProfileFields affiliate={affiliate} />
								<div className="affiliate-actions">
									<button type="submit" className="affiliate-primary">
										{action.pending ? "Saving…" : "Save profile"}
									</button>
									<button type="button" onClick={() => setEditing(false)}>
										Cancel
									</button>
								</div>
							</fieldset>
						</form>
					)}
				</section>
			</PermissionAccess>
		</AffiliatePage>
	);
}
