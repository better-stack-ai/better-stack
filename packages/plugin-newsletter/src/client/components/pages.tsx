"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { newsletterPermissions } from "../../permissions";
import {
	NewsletterError,
	NewsletterLoading,
	NewsletterNotFound,
} from "./shared";

const Subscribers = lazy(() =>
	import("./pages/subscribers-page.internal").then((m) => ({
		default: m.SubscribersPage,
	})),
);
const Campaigns = lazy(() =>
	import("./pages/campaigns-page.internal").then((m) => ({
		default: m.CampaignsPage,
	})),
);
const Editor = lazy(() =>
	import("./pages/edit-campaign-page.internal").then((m) => ({
		default: m.EditCampaignPage,
	})),
);
const Stats = lazy(() =>
	import("./pages/campaign-stats-page.internal").then((m) => ({
		default: m.CampaignStatsPage,
	})),
);
const boundary = {
	ErrorComponent: NewsletterError,
	LoadingComponent: NewsletterLoading,
	NotFoundComponent: NewsletterNotFound,
	onError: (error: Error) => console.error("[btst/newsletter]", error),
};

export function SubscribersPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/newsletter/subscribers"
			permission={newsletterPermissions.subscriber.read({
				scope: "collection",
			})}
			PageComponent={Subscribers}
		/>
	);
}
export function CampaignsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/newsletter/campaigns"
			permission={newsletterPermissions.campaign.read({ scope: "collection" })}
			PageComponent={Campaigns}
		/>
	);
}
export function EditCampaignPageComponent({ id }: { id?: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={id ? `/newsletter/campaigns/${id}` : "/newsletter/campaigns/new"}
			permission={
				id
					? newsletterPermissions.campaign.read({
							scope: "record",
							campaignId: id,
						})
					: newsletterPermissions.campaign.create()
			}
			PageComponent={Editor}
			props={{ id }}
		/>
	);
}
export function CampaignStatsPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/newsletter/campaigns/${id}/stats`}
			permission={newsletterPermissions.analytics.read()}
			PageComponent={Stats}
			props={{ id }}
		/>
	);
}
