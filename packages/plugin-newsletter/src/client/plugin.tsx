import { lazy, type ComponentType } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import {
	createNewsletterQueryKeys,
	type NewsletterIdentityPartition,
} from "../query-keys";
import { NEWSLETTER_PLUGIN_ID } from "./constants";
import type { NewsletterPluginOverrides } from "./overrides";

const Subscribers = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.SubscribersPageComponent,
	})),
);
const Campaigns = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CampaignsPageComponent,
	})),
);
const Editor = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.EditCampaignPageComponent,
	})),
);
const Stats = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CampaignStatsPageComponent,
	})),
);

/** Server loader lifecycle context for a newsletter management route. */
export interface NewsletterLoaderContext {
	path: string;
	isSSR: boolean;
}
/** Newsletter page customization; shared API and site settings come from createClientStack. */
export interface NewsletterClientConfig {
	/** Match the current identity when hydrating protected server query data. */
	identityPartition?: NewsletterIdentityPartition;
	/** Lifecycle callbacks for server-side route prefetching. */
	hooks?: {
		beforeLoad?: (context: NewsletterLoaderContext) => void | Promise<void>;
		afterLoad?: (context: NewsletterLoaderContext) => void | Promise<void>;
		onErrorLoad?: (
			error: Error,
			context: NewsletterLoaderContext,
		) => void | Promise<void>;
	};
	/** Replace individual built-in management pages. */
	pageComponents?: {
		subscribers?: ComponentType;
		campaigns?: ComponentType;
		newCampaign?: ComponentType;
		editCampaign?: ComponentType<{ params: { id: string } }>;
		campaignStats?: ComponentType<{ params: { id: string } }>;
	};
}

/** Subscriber and campaign management routes with identity-partitioned SSR loaders. */
export const newsletterClientPlugin = (config: NewsletterClientConfig = {}) =>
	defineClientPlugin<NewsletterPluginOverrides>()({
		id: NEWSLETTER_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createNewsletterQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const preload =
				(
					path: string,
					entries: {
						queryKey: readonly unknown[];
						queryFn: () => Promise<unknown>;
					}[] = [],
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const context = { path, isSSR: true };
					let error: unknown;
					try {
						await config.hooks?.beforeLoad?.(context);
						await Promise.all(
							entries.map((entry) =>
								runtime.queryClient.prefetchQuery({ ...entry, retry: false }),
							),
						);
						error = entries
							.map(
								(entry) =>
									runtime.queryClient.getQueryState(entry.queryKey)?.error,
							)
							.find(Boolean);
						if (!error) await config.hooks?.afterLoad?.(context);
					} catch (caught) {
						error = caught;
						await Promise.all(
							entries.map((entry) =>
								runtime.queryClient.prefetchQuery({
									queryKey: entry.queryKey,
									queryFn: () => {
										throw createSanitizedSSRLoaderError();
									},
									retry: false,
									staleTime: 0,
								}),
							),
						);
					}
					if (!error) return;
					if (isConnectionError(error))
						console.warn(
							"[btst/newsletter] API unavailable during SSR prefetch.",
						);
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						/* Reporting cannot reject a route loader. */
					}
				};
			const meta = (title: string) => [
				{ title },
				{ name: "robots", content: "noindex, nofollow" },
			];
			return {
				routes: () =>
					defineRoutes(
						{
							subscribers: defineRoute("/newsletter/subscribers", {
								page: Subscribers,
								loader: preload("/newsletter/subscribers", [
									queries.newsletterSubscribers.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
									queries.newsletterGrowth.list(config.identityPartition),
								]),
								meta: () => meta("Subscribers"),
							}),
							campaigns: defineRoute("/newsletter/campaigns", {
								page: Campaigns,
								loader: preload("/newsletter/campaigns", [
									queries.newsletterCampaigns.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								]),
								meta: () => meta("Newsletter campaigns"),
							}),
							newCampaign: defineRoute("/newsletter/campaigns/new", {
								page: () => <Editor />,
								loader: preload("/newsletter/campaigns/new"),
								meta: () => meta("New campaign"),
							}),
							editCampaign: defineRoute("/newsletter/campaigns/:id", {
								page: ({ params }) => <Editor id={params.id} />,
								loader: ({ params }) =>
									preload(`/newsletter/campaigns/${params.id}`, [
										queries.newsletterCampaigns.detail(
											params.id,
											config.identityPartition,
										),
									])(),
								meta: () => meta("Edit campaign"),
							}),
							campaignStats: defineRoute("/newsletter/campaigns/:id/stats", {
								page: ({ params }) => <Stats id={params.id} />,
								loader: ({ params }) =>
									preload(`/newsletter/campaigns/${params.id}/stats`, [
										queries.newsletterCampaigns.detail(
											params.id,
											config.identityPartition,
										),
										queries.newsletterCampaigns.stats(
											params.id,
											config.identityPartition,
										),
									])(),
								meta: () => meta("Campaign results"),
							}),
						},
						{ pages: config.pageComponents },
					),
				sitemap: async () => [],
			};
		},
	});
