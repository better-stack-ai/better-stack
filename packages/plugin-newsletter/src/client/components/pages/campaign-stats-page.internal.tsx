"use client";

import { useCampaign, useCampaignStats } from "../../hooks";
import { NewsletterPage, Status } from "../shared";

export function CampaignStatsPage({ id }: { id: string }) {
	const { data: campaign } = useCampaign(id);
	const { data: stats } = useCampaignStats(id);
	const metrics = [
		["Recipients", stats.recipientCount],
		["Delivered", stats.delivered],
		["Opened", stats.opened],
		["Clicked", stats.clicked],
		["Bounced", stats.bounced],
		["Failed", stats.failed],
	] as const;
	return (
		<NewsletterPage
			page="campaignStats"
			title={campaign.subject}
			description="Delivery and engagement for this campaign."
		>
			<div className="flex flex-wrap items-center gap-3">
				<Status value={campaign.status} />
				{campaign.sentAt && (
					<p className="text-sm text-muted-foreground">
						Sent {new Date(campaign.sentAt).toLocaleString()}
					</p>
				)}
			</div>
			<dl className="grid grid-cols-2 gap-x-8 gap-y-6 border-y py-6 sm:grid-cols-3 lg:grid-cols-6">
				{metrics.map(([label, value]) => (
					<div key={label} className="space-y-2">
						<dt className="text-sm text-muted-foreground">{label}</dt>
						<dd className="text-3xl font-semibold tabular-nums">
							{value.toLocaleString()}
						</dd>
					</div>
				))}
			</dl>
			<div className="grid gap-8 sm:grid-cols-2">
				{[
					["Open rate", stats.openRate],
					["Click rate", stats.clickRate],
				].map(([label, value]) => (
					<div className="space-y-3" key={label}>
						<div className="flex items-baseline justify-between gap-4">
							<h2 className="font-medium">{label}</h2>
							<p className="text-2xl font-semibold tabular-nums">
								{(Number(value) * 100).toFixed(1)}%
							</p>
						</div>
						<div
							className="h-2 overflow-hidden rounded-full bg-muted"
							aria-hidden="true"
						>
							<div
								className="h-full rounded-full bg-primary"
								style={{
									width: `${Math.max(0, Math.min(100, Number(value) * 100))}%`,
								}}
							/>
						</div>
					</div>
				))}
			</div>
			<p className="max-w-2xl text-sm text-muted-foreground">
				Delivered counts messages accepted by your email provider. Opens and
				clicks count unique recipients; email privacy settings and image
				blocking can affect open tracking.
			</p>
		</NewsletterPage>
	);
}
