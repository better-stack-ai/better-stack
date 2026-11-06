"use client";

import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import {
	newsletterResources,
	type SubscriberListParams,
} from "../../query-keys";
import { NEWSLETTER_PLUGIN_ID } from "../constants";

const newsletter = createResource({
	plugin: NEWSLETTER_PLUGIN_ID,
	resources: newsletterResources,
});

function useNewsletterIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}

/** Fetch one subscriber page scoped to the current identity. */
export const useSubscribers = (params: SubscriberListParams = {}) =>
	newsletter.newsletterSubscribers.list.useSuspense([
		params,
		useNewsletterIdentity(),
	]);
/** Fetch one campaign page scoped to the current identity. */
export const useCampaigns = (
	params: { limit?: number; offset?: number } = {},
) =>
	newsletter.newsletterCampaigns.list.useSuspense([
		params,
		useNewsletterIdentity(),
	]);
/** Fetch a campaign's editable sender, content and audience. */
export const useCampaign = (id: string) =>
	newsletter.newsletterCampaigns.detail.useSuspense([
		id,
		useNewsletterIdentity(),
	]);
/** Fetch unique recipient engagement for one campaign. */
export const useCampaignStats = (id: string) =>
	newsletter.newsletterCampaigns.stats.useSuspense([
		id,
		useNewsletterIdentity(),
	]);
/** Fetch subscriber counts and daily growth. */
export const useSubscriberGrowth = () =>
	newsletter.newsletterGrowth.list.useSuspense([useNewsletterIdentity()]);
export const useCreateSubscriber = () =>
	newsletter.newsletterSubscribers.create.use();
export const useUpdateSubscriber = () =>
	newsletter.newsletterSubscribers.update.use();
export const useDeleteSubscriber = () =>
	newsletter.newsletterSubscribers.delete.use();
export const useImportSubscribers = () =>
	newsletter.newsletterSubscribers.import.use();
export const useSubscriberExport = () =>
	newsletter.newsletterSubscribers.export.use([useNewsletterIdentity()], {
		enabled: false,
	});
export const useCreateCampaign = () =>
	newsletter.newsletterCampaigns.create.use();
export const useUpdateCampaign = () =>
	newsletter.newsletterCampaigns.update.use();
export const useDeleteCampaign = () =>
	newsletter.newsletterCampaigns.delete.use();
export const useSendCampaign = () => newsletter.newsletterCampaigns.send.use();
export const useTestCampaign = () => newsletter.newsletterCampaigns.test.use();
export const useScheduleCampaign = () =>
	newsletter.newsletterCampaigns.schedule.use();

/** Inspect live recovery outcomes in the browser without exposing tracking tokens. */
export const useCampaignRecovery = (id: string) =>
	newsletter.newsletterCampaigns.recovery.use([id, useNewsletterIdentity()], {
		enabled: typeof window !== "undefined",
	});
/** Resume only safe, eligible recipients from the original audience. */
export const useResumeCampaign = () =>
	newsletter.newsletterCampaigns.resume.use();
/** Reconcile uncertain outcomes using the provider's receipts where supported. */
export const useReconcileCampaign = () =>
	newsletter.newsletterCampaigns.reconcile.use();
/** Record an explicit manager decision about an uncertain recipient. */
export const useResolveCampaignRecipient = () =>
	newsletter.newsletterCampaigns.resolve.use();
