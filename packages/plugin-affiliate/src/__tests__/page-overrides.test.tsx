import { AffiliateDetailPage } from "../client/components/pages/affiliate-detail-page.internal";
import { AffiliatePortalPage } from "../client/components/pages/affiliate-portal-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AffiliatePluginOverrides } from "../client/overrides";
import { Stats } from "../client/components/shared";

const state = vi.hoisted(() => ({ overrides: {} as AffiliatePluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));

const props = { stats: { clicks: 2, conversions: 1, totals: [] } };
const pages = ["affiliateDetail", "portal"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<Stats {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("affiliate page-scoped Stats", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { Stats: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("Referral clicks");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("Referral clicks");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("Referral clicks");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

const affiliate = {
	id: "affiliate-1",
	userId: "user-1",
	name: "Alex",
	email: "alex@example.com",
	code: "alex",
	status: "approved",
	createdAt: "2026-11-06",
	updatedAt: "2026-11-06",
};
vi.mock("../client/hooks", () => ({
	useAffiliate: () => ({ data: { affiliate, stats: props.stats } }),
	useAffiliateDashboard: () => ({
		data: {
			affiliate,
			stats: props.stats,
			commissions: [],
			payouts: [],
			assets: [],
		},
	}),
	useDeleteAffiliate: () => ({}),
	useUpdateAffiliate: () => ({}),
	useUpdateAffiliateProfile: () => ({}),
	useReferralLink: () => vi.fn(),
}));
it("built-in admin and portal supply independent explicit scopes", () => {
	state.overrides = {
		pageOverrides: {
			affiliateDetail: { Stats: () => <section data-built-in="admin" /> },
		},
	};
	expect(
		renderToStaticMarkup(<AffiliateDetailPage id="affiliate-1" />),
	).toContain('data-built-in="admin"');
	const portal = renderToStaticMarkup(<AffiliatePortalPage />);
	expect(portal).not.toContain('data-built-in="admin"');
	expect(portal).toContain("Referral clicks");
	state.overrides = {
		pageOverrides: {
			portal: { Stats: () => <section data-built-in="portal" /> },
		},
	};
	expect(renderToStaticMarkup(<AffiliatePortalPage />)).toContain(
		'data-built-in="portal"',
	);
});
