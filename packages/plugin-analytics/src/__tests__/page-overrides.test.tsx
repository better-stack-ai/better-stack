import { AnalyticsDashboardPage } from "../client/components/pages/dashboard-page.internal";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { analyticsClientPlugin } from "../client/plugin";
import type { AnalyticsPluginOverrides } from "../client/overrides";
import { TrafficChart } from "../client/components/traffic-chart";

vi.mock("../client/hooks", () => ({
	useSuspenseDashboardStats: () => ({
		data: {
			uniqueVisitors: 3,
			pageViews: 12,
			bounceRate: 0,
			sessionDuration: 60,
			series: props.series,
			topPages: [],
			topReferrers: [],
			topEvents: [],
		},
		isFetching: false,
	}),
	useRealtimeVisitors: () => ({ data: { visitors: 1 }, isError: false }),
	useFunnelReport: () => ({ isFetching: false }),
}));

const props: ComponentProps<typeof TrafficChart> = {
	series: [{ date: "2026-11-06", pageViews: 12, visitors: 3 }],
};
const pages = ["analyticsDashboard"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				AnalyticsPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["TrafficChart"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.series[0]?.pageViews}</output>
);

function render(page: ReactElement, overrides: AnalyticsPluginOverrides = {}) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { analytics: analyticsClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ analytics: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("analytics page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { TrafficChart: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(<TrafficChart {...props} page={page} />, overrides);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { TrafficChart: custom("specific") } },
		};
		expect(
			render(<TrafficChart {...props} page={pages[0]} />, overrides),
		).toContain('data-slot-override="specific"');
		for (const page of pages.slice(1)) {
			const html = render(<TrafficChart {...props} page={page} />, overrides);
			expect(html).toContain("Traffic over time");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<TrafficChart {...props} />, overrides);
		expect(standalone).toContain("Traffic over time");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<TrafficChart {...props} page={page} />);
			expect(html).toContain("Traffic over time");
			expect(
				render(<TrafficChart {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [<AnalyticsDashboardPage />];
	const scopes = pages;
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { TrafficChart: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});

it("preserves standalone rendering without StackProvider", () => {
	expect(renderToStaticMarkup(<TrafficChart {...props} />)).toContain(
		"Traffic over time",
	);
});
