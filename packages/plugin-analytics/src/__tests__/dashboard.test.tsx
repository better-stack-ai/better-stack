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
const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), fetch: vi.fn() }));
vi.mock("../client/hooks", () => ({
	useSuspenseDashboardStats: (...args: unknown[]) => mocks.dashboard(...args),
	useRealtimeVisitors: () => ({ data: { visitors: 1 }, isError: false }),
}));
vi.mock("@btst/stack/context", () => ({
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
