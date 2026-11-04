"use client";

import type { FormEvent } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { affiliatePermissions } from "../../../permissions";
import type { AffiliateStatus, CommissionType } from "../../../types";
import {
	useAffiliate,
	useDeleteAffiliate,
	useUpdateAffiliate,
} from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import {
	ActionNotice,
	AffiliatePage,
	ProfileFields,
	readProfile,
	Stats,
	Status,
	useAffiliateAction,
} from "../shared";

export function AffiliateDetailPage({ id }: { id: string }) {
	const { data } = useAffiliate(id);
	const { affiliate, stats } = data;
	const update = useUpdateAffiliate();
	const remove = useDeleteAffiliate();
	const action = useAffiliateAction();
	const { Link, resolve, navigate } =
		usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const facts = {
		affiliateId: affiliate.id,
		userId: affiliate.userId,
		status: affiliate.status,
	};
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		const commissionType = String(fields.get("commissionType") ?? "");
		const commissionValue = String(fields.get("commissionValue") ?? "");
		void action.run(async () => {
			if (commissionType && !commissionValue.trim())
				throw new Error(
					"Enter a commission value or select the program default.",
				);
			await update.mutateAsync({
				id,
				data: {
					...readProfile(fields),
					status: String(fields.get("status")) as AffiliateStatus,
					notes: String(fields.get("notes") ?? ""),
					commissionType: commissionType
						? (commissionType as CommissionType)
						: null,
					commissionValue: commissionType ? Number(commissionValue) : null,
				},
			});
		}, "Affiliate profile saved");
	};
	return (
		<AffiliatePage
			title={affiliate.name}
			description={affiliate.email}
			action={<Status value={affiliate.status} />}
		>
			<Link href={resolve("affiliate/admin/affiliates").href}>
				Back to affiliates
			</Link>
			<Stats stats={stats} />
			<ActionNotice {...action} />
			<PermissionAccess
				permission={affiliatePermissions.affiliate.update(facts)}
			>
				<form
					className="affiliate-stack"
					key={affiliate.updatedAt}
					onSubmit={save}
				>
					<h2>Profile and commission rule</h2>
					<p className="affiliate-small affiliate-muted">
						Account: {affiliate.userId}
					</p>
					<fieldset disabled={action.pending}>
						<ProfileFields affiliate={affiliate} admin />
						<div className="affiliate-actions">
							<button className="affiliate-primary" type="submit">
								{action.pending ? "Saving…" : "Save profile"}
							</button>
						</div>
					</fieldset>
				</form>
			</PermissionAccess>
			<PermissionAccess
				permission={affiliatePermissions.affiliate.delete(facts)}
			>
				<section className="affiliate-section affiliate-stack">
					<h2>Remove affiliate</h2>
					<p className="affiliate-muted">
						Only affiliates without conversions, commissions, or payouts can be
						deleted. Suspend a partner to stop new referrals and preserve their
						history.
					</p>
					<div>
						<button
							type="button"
							disabled={action.pending}
							onClick={() => {
								if (
									window.confirm(
										`Delete ${affiliate.name}? This removes their affiliate profile.`,
									)
								)
									void action.run(async () => {
										await remove.mutateAsync(id);
										await navigate("affiliate/admin/affiliates");
									});
							}}
						>
							Delete affiliate
						</button>
					</div>
				</section>
			</PermissionAccess>
		</AffiliatePage>
	);
}
