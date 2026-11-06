import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AnalyticsDashboardPage } from "../../../plugin-analytics/src/client/components/pages/dashboard-page.internal";
import { OrdersAdminPage } from "../../../plugin-ecommerce/src/client/components/pages/orders-admin-page.internal";
import { CalendarDashboardPage } from "../../../plugin-calendar/src/client/components/pages/dashboard";
import { FlagsPage } from "../../../plugin-feature-flags/src/client/components/pages/flags-page.internal";
import { AffiliatesPage } from "../../../plugin-affiliate/src/client/components/pages/affiliates-page.internal";
const state = vi.hoisted(() => ({
	context: null as any,
	secret: "PRIVATE_RECORD_SENTINEL",
	record: {
		id: "private-id",
		name: "Private profile",
		email: "PRIVATE_RECORD_SENTINEL",
		status: "approved",
		userId: "private-user",
		code: "private-code",
		createdAt: "2026-01-01T00:00:00Z",
		paymentStatus: "paid",
		total: 100,
		currency: "USD",
		checkoutToken: "PRIVATE_RECORD_SENTINEL",
		cancelToken: "PRIVATE_RECORD_SENTINEL",
		payoutCredentials: "PRIVATE_RECORD_SENTINEL",
	},
}));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	PermissionAccess: () => null,
	useIdentity: () => ({ identity: { id: "admin" } }),
	useStack: () => ({ plugins: {} }),
	usePluginOverrides: () => ({}),
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: () => ({ href: "/" }),
	}),
}));
vi.mock("../../../plugin-analytics/src/client/hooks", () => ({
	useSuspenseDashboardStats: () => ({
		data: {
			uniqueVisitors: 3,
			pageViews: 7,
			bounceRate: 0,
			sessionDuration: 60,
			series: [],
			topPages: [],
			topReferrers: [],
			topEvents: [],
			rawEvents: [state.record],
		},
	}),
	useRealtimeVisitors: () => ({
		data: { visitors: 2, sessions: [state.record] },
	}),
}));
vi.mock("../../../plugin-ecommerce/src/client/hooks/use-orders", () => ({
	useOrders: () => ({ data: { total: 1, items: [state.record] } }),
	useMyOrders: () => ({}),
}));
vi.mock("../../../plugin-ecommerce/src/client/components/storefront", () => ({
	Storefront: () => null,
	ErrorMessage: () => null,
	formatMoney: () => "$1",
}));
vi.mock("../../../plugin-calendar/src/client/hooks", () => ({
	useCalendarEvents: () => ({
		data: [
			{
				...state.record,
				active: true,
				slug: "private-event",
				hostId: "host",
				duration: 30,
				capacity: 1,
			},
		],
	}),
	useDeleteCalendarEvent: () => ({}),
	useCalendarBookings: () => ({ data: { items: [state.record] } }),
	useCancelHostCalendarBooking: () => ({}),
}));
vi.mock("../../../plugin-calendar/src/client/components/shared", () => ({
	CalendarPage: () => null,
	formatCalendarTime: () => "",
}));
vi.mock("../../../plugin-feature-flags/src/client/hooks", () => ({
	useSuspenseFlags: () => ({
		data: [
			{
				...state.record,
				key: "private-flag",
				tags: [],
				enabled: true,
				targeting: { email: state.secret },
				payload: { secret: state.secret },
			},
		],
	}),
	useToggleFlag: () => ({}),
}));
vi.mock("../../../plugin-feature-flags/src/client/components/shared", () => ({
	FlagsPage: () => null,
	Rollout: () => null,
}));
vi.mock("../../../plugin-affiliate/src/client/hooks", () => ({
	useAffiliates: () => ({ data: { total: 1, items: [state.record] } }),
	useCreateAffiliate: () => ({}),
	useUpdateAffiliate: () => ({}),
}));
vi.mock("../../../plugin-affiliate/src/client/components/shared", () => ({
	AffiliatePage: () => null,
	ActionNotice: () => null,
	Field: () => null,
	Pagination: () => null,
	ProfileFields: () => null,
	readProfile: () => ({}),
	Status: () => null,
	useAffiliateAction: () => ({}),
	date: () => "",
}));
it.each([
	[
		AnalyticsDashboardPage,
		"analytics-dashboard",
		{ uniqueVisitors: 3, pageViews: 7, realtimeVisitors: 2 },
	],
	[
		OrdersAdminPage,
		"ecommerce-orders-admin",
		{ totalOrders: 1, visibleOrders: 1, visiblePaidOrders: 1 },
	],
	[
		CalendarDashboardPage,
		"calendar-admin",
		{ eventTypes: 1, acceptingBookings: 1 },
	],
	[
		FlagsPage,
		"feature-flags-admin",
		{ totalFlags: 1, visibleFlags: 1, enabledFlags: 1 },
	],
	[
		AffiliatesPage,
		"affiliate-admin",
		{ totalAffiliates: 1, visibleAffiliates: 1 },
	],
] as const)(
	"registers only authorized summary context for %s",
	(Page, route, summary) => {
		renderToString(<Page />);
		expect(state.context.routeName).toBe(route);
		expect(state.context.clientTools).toBeUndefined();
		expect(JSON.parse(state.context.pageDescription)).toMatchObject(summary);
		expect(state.context.pageDescription).not.toContain(state.secret);
		expect(state.context.pageDescription).not.toContain("private-id");
		expect(state.context.pageDescription).not.toContain("private-user");
		expect(state.context.pageDescription).not.toContain("Private profile");
	},
);
