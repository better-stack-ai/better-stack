"use client";

import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { affiliateResources } from "../../query-keys";
import { createTrackingLink } from "../../attribution";
import type { ListParams } from "../../types";
import { AFFILIATE_PLUGIN_ID } from "../constants";

const affiliate = createResource({
	plugin: AFFILIATE_PLUGIN_ID,
	resources: affiliateResources,
});

function useAffiliatePartition() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const { plugins } = useStack();
	const api = plugins?.[AFFILIATE_PLUGIN_ID]?.api;
	return {
		identity,
		generation,
		isPending,
		error: !!error,
		endpoint: [api?.baseURL, api?.basePath],
		headers: [...new Headers(api?.browserHeaders)],
		credentials: api?.credentials,
	};
}

export const useAffiliates = (params: ListParams = {}) =>
	affiliate.affiliates.list.useSuspense([params, useAffiliatePartition()]);
export const useAffiliate = (id: string) =>
	affiliate.affiliates.detail.useSuspense([id, useAffiliatePartition()]);
export const useAffiliateDashboard = () =>
	affiliate.affiliatePortal.detail.useSuspense([useAffiliatePartition()]);
export const useCommissions = (params: ListParams = {}) =>
	affiliate.affiliateCommissions.list.useSuspense([
		params,
		useAffiliatePartition(),
	]);
export const usePayouts = (params: ListParams = {}) =>
	affiliate.affiliatePayouts.list.useSuspense([
		params,
		useAffiliatePartition(),
	]);
export const usePayoutExport = (params: ListParams = {}) =>
	affiliate.affiliatePayouts.export.use([params, useAffiliatePartition()], {
		enabled: false,
	});
export const useCreateAffiliate = () => affiliate.affiliates.create.use();
export const useUpdateAffiliate = () => affiliate.affiliates.update.use();
export const useDeleteAffiliate = () => affiliate.affiliates.delete.use();
export const useApplyAffiliate = () => affiliate.affiliatePortal.apply.use();
export const useUpdateAffiliateProfile = () =>
	affiliate.affiliatePortal.update.use();
export const useUpdateCommission = () =>
	affiliate.affiliateCommissions.update.use();
export const useCreatePayout = () => affiliate.affiliatePayouts.create.use();
export const useUpdatePayout = () => affiliate.affiliatePayouts.update.use();

/** Build a cookie-setting tracking link using the affiliate plugin's resolved API. */
export function useReferralLink() {
	const { plugins } = useStack();
	const api = plugins?.[AFFILIATE_PLUGIN_ID]?.api;
	return (code: string, landingPath = "/") => {
		const apiBaseURL = new URL(
			api?.basePath ?? "/api/data",
			api?.baseURL || window.location.origin,
		);
		return createTrackingLink(apiBaseURL.href, code, landingPath);
	};
}
