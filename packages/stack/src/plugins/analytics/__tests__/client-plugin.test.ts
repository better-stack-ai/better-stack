import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { defineClientPlugin, defineRoute } from "../../../plugins/client";
import { analyticsClientPlugin } from "../client/plugin";
import { setDefaultAnalyticsTracker, track } from "../client/tracker";

afterEach(() => vi.unstubAllGlobals());

function browserGlobals() {
	vi.stubGlobal("window", {
		location: {
			href: "https://site.test/pages/pricing",
			origin: "https://site.test",
			pathname: "/pages/pricing",
		},
	});
	vi.stubGlobal("document", { referrer: "" });
}

describe("analytics client composition", () => {
	it("keeps the analytics route alongside another plugin's dashboard route", () => {
		const stack = createClientStack({
			api: { baseURL: "https://site.test", basePath: "/api/data" },
			site: { baseURL: "https://site.test", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				analytics: analyticsClientPlugin(),
				cms: defineClientPlugin({
					id: "cms",
					resolve: () => ({
						routes: () => ({
							dashboard: defineRoute("/cms", { page: () => null }),
						}),
					}),
				}),
			},
		});
		expect(stack.router.getRoute("/analytics")?.PageComponent).toBeDefined();
		expect(stack.router.getRoute("/cms")?.PageComponent).toBeDefined();
	});

	it("forwards configured public headers for automatic views and the default track helper", async () => {
		browserGlobals();
		const beacon = vi.fn(() => true);
		const fetchMock = vi.fn(
			async (_url: string, _init: RequestInit) =>
				new Response(null, { status: 204 }),
		);
		vi.stubGlobal("navigator", { doNotTrack: "0", sendBeacon: beacon });
		vi.stubGlobal("fetch", fetchMock);
		const stack = createClientStack({
			api: { baseURL: "https://site.test", basePath: "/api/data" },
			site: { baseURL: "https://site.test", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { analytics: analyticsClientPlugin() },
			endpoints: {
				analytics: {
					api: {
						basePath: "/api/analytics",
						browserHeaders: { "X-Tenant": "public-tenant" },
					},
				},
			},
		});
		await stack.context.plugins.analytics!.hooks?.onRouteRender?.({
			path: "/pricing",
		});
		await track("signup_completed");
		expect(beacon).not.toHaveBeenCalled();
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
			"https://site.test/api/analytics/analytics/pageviews",
			"https://site.test/api/analytics/analytics/events",
		]);
		for (const [, init] of fetchMock.mock.calls) {
			const headers = new Headers(init.headers);
			expect(headers.get("x-tenant")).toBe("public-tenant");
			expect(headers.get("content-type")).toBe("application/json");
		}
		const [view, event] = fetchMock.mock.calls.map(([, init]) =>
			JSON.parse(String(init.body)),
		);
		expect(event.sessionId).toBe(view.sessionId);
	});

	it("never retains server request credentials in a collection tracker", async () => {
		browserGlobals();
		const existingDefault = vi.fn(async () => true);
		setDefaultAnalyticsTracker({
			pageView: async () => false,
			track: existingDefault,
		});
		vi.stubGlobal("window", undefined);
		const beacon = vi.fn(() => true);
		const fetchMock = vi.fn();
		vi.stubGlobal("navigator", { doNotTrack: "0", sendBeacon: beacon });
		vi.stubGlobal("fetch", fetchMock);
		const stack = createClientStack({
			api: {
				baseURL: "https://site.test",
				basePath: "/api/data",
				headers: {
					Authorization: "Bearer server-only-secret",
					Cookie: "session=private",
				},
			},
			site: { baseURL: "https://site.test", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { analytics: analyticsClientPlugin() },
		});
		await stack.context.plugins.analytics!.hooks?.onRouteRender?.({
			path: "/pricing",
		});
		expect(beacon).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		browserGlobals();
		await track("default_preserved_after_ssr");
		expect(existingDefault).toHaveBeenCalledWith(
			"default_preserved_after_ssr",
			undefined,
		);
		await stack.context.plugins.analytics!.hooks?.onRouteRender?.({
			path: "/pricing",
		});
		expect(beacon).toHaveBeenCalledOnce();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
