"use client";

import { lazy, useEffect, useState, type ReactNode } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { affiliatePermissions } from "../../permissions";
import { AffiliateError, AffiliateLoading, AffiliateNotFound } from "./shared";

const Affiliates = lazy(() =>
	import("./pages/affiliates-page.internal").then((m) => ({
		default: m.AffiliatesPage,
	})),
);
const Detail = lazy(() =>
	import("./pages/affiliate-detail-page.internal").then((m) => ({
		default: m.AffiliateDetailPage,
	})),
);
const Commissions = lazy(() =>
	import("./pages/commissions-page.internal").then((m) => ({
		default: m.CommissionsPage,
	})),
);
const Payouts = lazy(() =>
	import("./pages/payouts-page.internal").then((m) => ({
		default: m.PayoutsPage,
	})),
);
const Apply = lazy(() =>
	import("./pages/affiliate-apply-page.internal").then((m) => ({
		default: m.AffiliateApplyPage,
	})),
);
const Portal = lazy(() =>
	import("./pages/affiliate-portal-page.internal").then((m) => ({
		default: m.AffiliatePortalPage,
	})),
);

function BrowserPage({ children }: { children: ReactNode }) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return mounted ? children : <AffiliateLoading />;
}

const boundary = {
	ErrorComponent: AffiliateError,
	LoadingComponent: AffiliateLoading,
	NotFoundComponent: AffiliateNotFound,
	onError: (error: Error) => console.error("[btst/affiliate]", error),
};

function AffiliateList() {
	return (
		<BrowserPage>
			<Affiliates />
		</BrowserPage>
	);
}
function AffiliateDetail(props: { id: string }) {
	return (
		<BrowserPage>
			<Detail {...props} />
		</BrowserPage>
	);
}
function CommissionList() {
	return (
		<BrowserPage>
			<Commissions />
		</BrowserPage>
	);
}
function PayoutList() {
	return (
		<BrowserPage>
			<Payouts />
		</BrowserPage>
	);
}
function Application() {
	return (
		<BrowserPage>
			<Apply />
		</BrowserPage>
	);
}
function PortalDashboard() {
	return (
		<BrowserPage>
			<Portal />
		</BrowserPage>
	);
}

export function AffiliatesPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/affiliate/admin/affiliates"
			permission={affiliatePermissions.affiliate.read({ scope: "collection" })}
			PageComponent={AffiliateList}
		/>
	);
}
export function AffiliateDetailPageComponent({ id }: { id: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/affiliate/admin/affiliates/${id}`}
			permission={affiliatePermissions.affiliate.read({
				scope: "record",
				affiliateId: id,
			})}
			PageComponent={AffiliateDetail}
			props={{ id }}
		/>
	);
}
export function CommissionsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/affiliate/admin/commissions"
			permission={affiliatePermissions.commission.read()}
			PageComponent={CommissionList}
		/>
	);
}
export function PayoutsPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/affiliate/admin/payouts"
			permission={affiliatePermissions.payout.read()}
			PageComponent={PayoutList}
		/>
	);
}
export function AffiliateApplyPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/affiliate/apply"
			permission={affiliatePermissions.application.create()}
			PageComponent={Application}
		/>
	);
}
export function AffiliatePortalPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/affiliate/portal"
			permission={affiliatePermissions.portal.read()}
			PageComponent={PortalDashboard}
		/>
	);
}
