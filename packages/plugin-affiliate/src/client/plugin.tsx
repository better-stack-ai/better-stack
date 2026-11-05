import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	defineRoute,
	defineRoutes,
} from "@btst/stack/plugins/client";
import { AFFILIATE_PLUGIN_ID } from "./constants";
import type { AffiliatePluginOverrides } from "./overrides";

const Affiliates = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.AffiliatesPageComponent,
	})),
);
const Detail = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.AffiliateDetailPageComponent,
	})),
);
const Commissions = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CommissionsPageComponent,
	})),
);
const Payouts = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.PayoutsPageComponent,
	})),
);
const Apply = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.AffiliateApplyPageComponent,
	})),
);
const Portal = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.AffiliatePortalPageComponent,
	})),
);

/** Optional replacements for the dynamic affiliate administration and portal pages. */
export interface AffiliateClientConfig {
	pageComponents?: {
		affiliates?: ComponentType;
		affiliateDetail?: ComponentType<{ params: { id: string } }>;
		commissions?: ComponentType;
		payouts?: ComponentType;
		apply?: ComponentType;
		portal?: ComponentType;
	};
}

/** Affiliate operations and self-service pages. Protected data loads in the browser. */
export const affiliateClientPlugin = (config: AffiliateClientConfig = {}) =>
	defineClientPlugin<AffiliatePluginOverrides>()({
		id: AFFILIATE_PLUGIN_ID,
		resolve: () => ({
			routes: () =>
				defineRoutes(
					{
						affiliates: defineRoute("/affiliate/admin/affiliates", {
							page: Affiliates,
							meta: () => meta("Affiliates"),
						}),
						affiliateDetail: defineRoute("/affiliate/admin/affiliates/:id", {
							page: ({ params }) => <Detail id={params.id} />,
							meta: () => meta("Affiliate profile"),
						}),
						commissions: defineRoute("/affiliate/admin/commissions", {
							page: Commissions,
							meta: () => meta("Commissions"),
						}),
						payouts: defineRoute("/affiliate/admin/payouts", {
							page: Payouts,
							meta: () => meta("Payouts"),
						}),
						apply: defineRoute("/affiliate/apply", {
							page: Apply,
							meta: () => meta("Apply to become an affiliate"),
						}),
						portal: defineRoute("/affiliate/portal", {
							page: Portal,
							meta: () => meta("Affiliate portal"),
						}),
					},
					{ pages: config.pageComponents },
				),
			sitemap: async () => [],
		}),
	});

function meta(title: string) {
	return [{ title }, { name: "robots", content: "noindex, nofollow" }];
}
