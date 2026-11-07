// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsDashboardPage } from "../client/components/pages/dashboard-page.internal";
import type { AnalyticsDashboardStats } from "../types";

const stats: AnalyticsDashboardStats = {
	uniqueVisitors: 2,
	pageViews: 3,
	bounceRate: 50,
	sessionDuration: 65,
	series: [{ date: "2026-11-03", pageViews: 3, visitors: 2 }],
	topPages: [{ path: "/pricing", views: 3, visitors: 2, trend: [3] }],
	topReferrers: [{ referrer: "search.test", views: 2, visitors: 1 }],
	topEvents: [{ name: "signup_completed", count: 1 }],
};
const mocks = vi.hoisted(() => ({
	dashboard: vi.fn(),
	experiment: vi.fn(),
	fetch: vi.fn(),
}));
vi.mock("../client/hooks", () => ({
	useSuspenseDashboardStats: (...args: unknown[]) => mocks.dashboard(...args),
	useExperimentReport: (...args: unknown[]) => mocks.experiment(...args),
	useRealtimeVisitors: () => ({ data: { visitors: 1 }, isError: false }),
}));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => ({}),
	useStack: () => ({
		plugins: {
			analytics: {
				api: {
					baseURL: "https://site.test",
					basePath: "/api/data",
					credentials: "include",
				},
			},
		},
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	mocks.dashboard
		.mockReset()
		.mockReturnValue({ data: stats, isFetching: false });
	mocks.experiment.mockReset().mockReturnValue({
		data: {
			experimentKey: "checkout",
			flagKey: "checkout-layout",
			attribution: "same-session-utc-day",
			rows: [
				{
					configurationVersion: "abcdef0123456789",
					variant: "compact",
					flagKey: "checkout-layout",
					conversionEvent: "order_paid",
					attributionWindowMs: 1800000,
					subjects: 4,
					exposures: 4,
					conversions: 1,
					conversionRate: 25,
				},
			],
		},
		isPending: false,
		isFetching: false,
		isError: false,
	});
	mocks.fetch.mockReset().mockResolvedValue(
		new Response("type,path\npageview,/pricing", {
			headers: { "content-type": "text/csv" },
		}),
	);
	vi.stubGlobal("fetch", mocks.fetch);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = vi.fn(() => "blob:export");
			static revokeObjectURL = vi.fn();
		},
	);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<AnalyticsDashboardPage />));
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

async function click(label: string) {
	const button = [...container.querySelectorAll("button")].find(
		(element) => element.textContent === label,
	);
	expect(button).toBeDefined();
	await act(async () => button!.click());
}

describe("analytics dashboard", () => {
	it("requests experiment samples only when selected and keeps their definition and UTC boundaries visible", async () => {
		expect(mocks.experiment).not.toHaveBeenCalled();
		await act(async () =>
			root.render(<AnalyticsDashboardPage experiments={["checkout"]} />),
		);
		expect(mocks.experiment).toHaveBeenLastCalledWith({
			range: "7d",
			experimentKey: "checkout",
		});
		const report = container.querySelector(
			'table[aria-label="Variant conversions for checkout"]',
		);
		expect(report?.textContent).toContain("compact");
		expect(report?.textContent).toContain("order_paid");
		expect(report?.textContent).toContain("25.0%");
		expect(report?.textContent).toContain("30 min");
		expect(report?.querySelector("code")?.title).toBe("abcdef0123456789");
		expect(container.textContent).toContain(
			"one anonymous session and UTC day",
		);
		await click("Today");
		expect(mocks.experiment).toHaveBeenLastCalledWith({
			range: "today",
			experimentKey: "checkout",
		});
	});

	it("hides stale experiment counts when the report request fails", async () => {
		mocks.experiment.mockReturnValue({
			...mocks.experiment.getMockImplementation()!(),
			isError: true,
		});
		await act(async () =>
			root.render(<AnalyticsDashboardPage experiments={["checkout"]} />),
		);
		expect(container.textContent).toContain("Experiment report unavailable");
		expect(
			container.querySelector(
				'table[aria-label="Variant conversions for checkout"]',
			),
		).toBeNull();
	});

	it("uses the chosen date range and submits explicit UTC dates for a custom range", async () => {
		expect(container.textContent).toContain("signup_completed");
		expect(container.textContent).toContain("1m 5s");
		await click("30 days");
		expect(mocks.dashboard).toHaveBeenLastCalledWith({ range: "30d" });
		await click("Custom");
		const inputs = container.querySelectorAll("input");
		await act(async () => {
			const setValue = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)!.set!;
			setValue.call(inputs[0], "2026-10-01");
			inputs[0]!.dispatchEvent(new Event("input", { bubbles: true }));
			inputs[0]!.dispatchEvent(new Event("change", { bubbles: true }));
			setValue.call(inputs[1], "2026-10-31");
			inputs[1]!.dispatchEvent(new Event("input", { bubbles: true }));
			inputs[1]!.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(mocks.dashboard).toHaveBeenLastCalledWith({
			range: "custom",
			start: "2026-10-01",
			end: "2026-10-31",
		});
	});

	it("exports the selected range with the resolved credentials and reports export failures", async () => {
		await click("Today");
		await click("Export CSV");
		expect(mocks.fetch).toHaveBeenCalledWith(
			"https://site.test/api/data/analytics/export?range=today",
			expect.objectContaining({ credentials: "include" }),
		);
		expect(URL.createObjectURL).toHaveBeenCalled();
		mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
		await click("Export CSV");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Check your export access",
		);
	});
});
