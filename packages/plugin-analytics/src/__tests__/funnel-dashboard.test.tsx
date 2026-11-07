// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunnelReport } from "../client/components/funnel-report";
import type { AnalyticsFunnelParams } from "../types";

const mocks = vi.hoisted(() => ({
	funnel: vi.fn(),
	fetch: vi.fn(),
	refetch: vi.fn(),
}));
vi.mock("../client/hooks", () => ({
	useFunnelReport: (...args: unknown[]) => mocks.funnel(...args),
}));
vi.mock("@btst/stack/context", () => ({
	useStack: () => ({
		plugins: {
			analytics: {
				api: {
					baseURL: "https://site.test",
					basePath: "/api/custom/",
					browserHeaders: { "x-tenant": "A" },
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

function result(params: AnalyticsFunnelParams, total = 4) {
	return {
		start: "2026-11-01T00:00:00.000Z",
		end: "2026-11-08T00:00:00.000Z",
		windowMinutes: params.windowMinutes,
		totalSessions: total,
		convertedSessions: total ? 1 : 0,
		conversionRate: total ? 25 : 0,
		steps: params.steps.map((step, index) => ({
			step,
			sessions: index === 0 ? total : total ? 1 : 0,
			conversionRate: total ? (index === 0 ? 100 : 25) : 0,
			dropOff: index === 0 ? 0 : total ? 3 : 0,
			dropOffRate: index === 0 ? 0 : total ? 75 : 0,
		})),
	};
}

beforeEach(async () => {
	mocks.funnel
		.mockReset()
		.mockImplementation((params: AnalyticsFunnelParams | null) => ({
			data: params ? result(params) : undefined,
			isFetching: false,
			refetch: mocks.refetch,
		}));
	mocks.fetch.mockReset().mockResolvedValue(
		new Response("step,sessions\n1,4", {
			headers: { "content-type": "text/csv" },
		}),
	);
	mocks.refetch.mockReset();
	vi.stubGlobal("fetch", mocks.fetch);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL = vi.fn(() => "blob:funnel");
			static revokeObjectURL = vi.fn();
		},
	);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(<FunnelReport range={{ range: "7d" }} />));
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
	)!;
	expect(button).toBeDefined();
	await act(async () => button.click());
}
async function run() {
	await act(async () =>
		container
			.querySelector("form")!
			.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
	);
}

describe("ordered funnel dashboard", () => {
	it("runs only submitted definitions, displays conversion and drop-off, and clears results after editing", async () => {
		expect(mocks.funnel).toHaveBeenLastCalledWith(null);
		await run();
		expect(mocks.funnel).toHaveBeenLastCalledWith({
			range: "7d",
			windowMinutes: 30,
			steps: [
				{ type: "pageview", path: "/", match: "exact" },
				{ type: "event", name: "purchase" },
			],
		});
		expect(container.textContent).toContain("1 of 4");
		expect(container.textContent).toContain("3 (75.0%)");
		await run();
		expect(mocks.refetch).toHaveBeenCalledOnce();
		await click("Add step");
		expect(container.querySelectorAll("fieldset")).toHaveLength(3);
		expect(mocks.funnel).toHaveBeenLastCalledWith(null);
		expect(container.textContent).not.toContain("sessions completed all steps");
		expect(
			[...container.querySelectorAll("button")].find(
				(button) => button.textContent === "Export funnel CSV",
			)!.disabled,
		).toBe(true);
	});

	it("exports the submitted report with the resolved transport and reports rejected export access", async () => {
		await run();
		await click("Export funnel CSV");
		const [url, init] = mocks.fetch.mock.calls[0]!;
		expect(url).toBe("https://site.test/api/custom/analytics/funnel/export");
		expect(init).toMatchObject({ method: "POST", credentials: "include" });
		expect(new Headers(init.headers).get("x-tenant")).toBe("A");
		expect(JSON.parse(init.body)).toMatchObject({
			range: "7d",
			windowMinutes: 30,
		});
		expect(URL.createObjectURL).toHaveBeenCalledOnce();
		mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
		await click("Export funnel CSV");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Check your export access",
		);
	});

	it("keeps empty reports stable and exposes query-limit errors", async () => {
		mocks.funnel.mockImplementation((params: AnalyticsFunnelParams | null) => ({
			data: params ? result(params, 0) : undefined,
			isFetching: false,
		}));
		await run();
		expect(container.querySelector('[role="status"]')?.textContent).toContain(
			"No sessions matched the first step",
		);
		expect(container.textContent).toContain("0.0% conversion");
		expect(container.textContent).not.toContain("NaN");
		mocks.funnel.mockReturnValue({
			error: new Error("Choose a range of 31 days or fewer."),
			isFetching: false,
		});
		await act(async () =>
			root.render(<FunnelReport range={{ range: "7d" }} />),
		);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"31 days",
		);
	});
});
