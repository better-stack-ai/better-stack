"use client";

import { useState } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { useCampaigns } from "../../hooks";
import { newsletterPermissions } from "../../../permissions";
import { NEWSLETTER_PLUGIN_ID } from "../../constants";
import type { NewsletterPluginOverrides } from "../../overrides";
import { NewsletterPage, Pagination, Status } from "../shared";

export function CampaignsPage() {
	const [offset, setOffset] = useState(0);
	const { data } = useCampaigns({ limit: 25, offset });
	const { Link, resolve } = usePluginSiteNavigation(NEWSLETTER_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<NewsletterPluginOverrides>(NEWSLETTER_PLUGIN_ID);
	return (
		<NewsletterPage
			title={localization?.title ?? "Newsletter"}
			description="Write to your subscribers. Follow each campaign from first draft to results."
			action={
				<PermissionAccess permission={newsletterPermissions.campaign.create()}>
					<Button asChild>
						<Link href={resolve("newsletter/campaigns/new").href}>
							{localization?.newCampaign ?? "New campaign"}
						</Link>
					</Button>
				</PermissionAccess>
			}
		>
			{data.items.length === 0 ? (
				<div className="space-y-3 py-10">
					<h2 className="text-xl font-medium">
						Your first newsletter starts here
					</h2>
					<p className="max-w-xl text-muted-foreground">
						Create a campaign, choose your audience, and send yourself a test
						before sharing it.
					</p>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full min-w-[600px] text-left text-sm">
						<caption className="sr-only">Newsletter campaigns</caption>
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="p-4 font-medium">Subject</th>
								<th className="p-4 font-medium">Status</th>
								<th className="p-4 font-medium">Audience</th>
								<th className="p-4 font-medium">Results</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((campaign) => (
								<tr key={campaign.id} className="border-b last:border-0">
									<td className="p-4">
										<Link
											className="font-medium underline-offset-4 hover:underline"
											href={resolve(`newsletter/campaigns/${campaign.id}`).href}
										>
											{campaign.subject}
										</Link>
										<p className="mt-1 text-xs text-muted-foreground">
											{campaign.fromName} &lt;{campaign.fromEmail}&gt;
										</p>
									</td>
									<td className="p-4">
										<Status value={campaign.status} />
										{campaign.scheduledAt && (
											<p className="mt-2 text-xs text-muted-foreground">
												{new Date(campaign.scheduledAt).toLocaleString()}
											</p>
										)}
									</td>
									<td className="p-4">
										{campaign.tags.length
											? campaign.tags.join(", ")
											: "All subscribers"}
									</td>
									<td className="p-4">
										<PermissionAccess
											permission={newsletterPermissions.analytics.read()}
										>
											<Link
												className="underline underline-offset-4"
												href={
													resolve(`newsletter/campaigns/${campaign.id}/stats`)
														.href
												}
											>
												View results
											</Link>
										</PermissionAccess>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</NewsletterPage>
	);
}
