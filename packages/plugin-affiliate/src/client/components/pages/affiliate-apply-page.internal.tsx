"use client";

import { useState, type FormEvent } from "react";
import {
	useIdentity,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { useApplyAffiliate } from "../../hooks";
import { AFFILIATE_PLUGIN_ID } from "../../constants";
import type { AffiliatePluginOverrides } from "../../overrides";
import {
	ActionNotice,
	AffiliatePage,
	ProfileFields,
	readProfile,
	useAffiliateAction,
} from "../shared";

export function AffiliateApplyPage() {
	const { identity } = useIdentity();
	const [applied, setApplied] = useState(false);
	const apply = useApplyAffiliate();
	const action = useAffiliateAction();
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			await apply.mutateAsync(readProfile(fields));
			setApplied(true);
		}, "Application submitted");
	};
	return (
		<AffiliatePage
			title={localization?.apply ?? "Become an affiliate"}
			description="Apply for a referral code and earn commissions on attributed conversions after approval."
			admin={false}
		>
			<div className="affiliate-application">
				<ActionNotice {...action} />
				{applied ? (
					<section className="affiliate-stack">
						<h2>Your application is pending review</h2>
						<p>
							You can view your status and update your payout details in the
							affiliate portal.
						</p>
						<Link
							className="affiliate-primary"
							href={resolve("affiliate/portal").href}
						>
							Open affiliate portal
						</Link>
					</section>
				) : (
					<form className="affiliate-stack" onSubmit={save}>
						<fieldset disabled={action.pending}>
							<ProfileFields
								defaults={{ name: identity?.name, email: identity?.email }}
							/>
							<button className="affiliate-primary" type="submit">
								{action.pending ? "Submitting…" : "Submit application"}
							</button>
						</fieldset>
					</form>
				)}
			</div>
		</AffiliatePage>
	);
}
