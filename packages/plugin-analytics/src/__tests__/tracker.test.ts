import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsTracker, track } from "../client/tracker";

const beacon = vi.fn((_url: string, _body: Blob) => true);
const fetchMock = vi.fn(
	async (_url: string, _init: RequestInit) =>
		new Response(null, { status: 204 }),
);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
	beacon.mockReset().mockReturnValue(true);
	fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
	vi.stubGlobal("window", {
		location: {
			href: "https://site.test/pricing?email=private#details",
			origin: "https://site.test",
		},
	});
	vi.stubGlobal("document", {
		referrer: "https://search.test/results?private=secret",
	});
	vi.stubGlobal("navigator", { sendBeacon: beacon, doNotTrack: "0" });
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function beaconBody(index = 0) {
	return JSON.parse(await (beacon.mock.calls[index]![1] as Blob).text());
}

describe("analytics tracker", () => {
	it("tracks on HTTP origins without randomUUID using cryptographic session IDs", async () => {
		const getRandomValues = globalThis.crypto.getRandomValues.bind(
			globalThis.crypto,
		);
		vi.stubGlobal("crypto", { getRandomValues, randomUUID: undefined });
		const tracker = createAnalyticsTracker();
		expect(await tracker.pageView()).toBe(true);
		expect(await tracker.track("clicked")).toBe(true);
		expect(await createAnalyticsTracker().track("another_visit")).toBe(true);
		const first = (await beaconBody()).sessionId;
		expect(first).toMatch(/^[a-f0-9]{32}$/);
		expect((await beaconBody(1)).sessionId).toBe(first);
		expect((await beaconBody(2)).sessionId).not.toBe(first);
	});

	it("sends private page paths and referrer origins using a beacon, without storage", async () => {
		const tracker = createAnalyticsTracker({ apiBasePath: "/api/data/" });
		expect(await tracker.pageView()).toBe(true);
		expect(beacon.mock.calls[0]![0]).toBe("/api/data/analytics/pageviews");
		expect(await beaconBody()).toEqual({
			path: "/pricing",
			referrer: "https://search.test",
			sessionId: expect.any(String),
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shares one in-memory session for page views and events, then expires after inactivity", async () => {
		const tracker = createAnalyticsTracker();
		await tracker.pageView();
		await tracker.track("signup_completed", { plan: "pro" });
		const first = await beaconBody();
		expect(await beaconBody(1)).toMatchObject({
			name: "signup_completed",
			path: "/pricing",
			properties: { plan: "pro" },
			sessionId: first.sessionId,
		});
		vi.advanceTimersByTime(31 * 60000);
		await tracker.track("returned");
		expect((await beaconBody(2)).sessionId).not.toBe(first.sessionId);
	});

	it.each(["", "https://site.test/blog?private=secret"])(
		"marks direct and internal visits explicitly without a self-referrer: %s",
		async (referrer) => {
			vi.stubGlobal("document", { referrer });
			await createAnalyticsTracker({
				apiBaseURL: "https://api.test",
			}).pageView();
			expect((await beaconBody()).referrer).toBe("");
		},
	);

	it.each([undefined, "https://api.test/"])(
		"keeps a root API mount on its configured origin: %s",
		async (apiBaseURL) => {
			await createAnalyticsTracker({ apiBaseURL, apiBasePath: "/" }).pageView();
			expect(beacon.mock.calls[0]![0]).toBe(
				`${apiBaseURL?.replace(/\/$/, "") ?? ""}/analytics/pageviews`,
			);
		},
	);

	it("deduplicates nested render notifications but counts a return visit", async () => {
		const tracker = createAnalyticsTracker();
		await tracker.pageView("/blog?private=value");
		await tracker.pageView("/blog");
		expect(beacon).toHaveBeenCalledTimes(1);
		await tracker.pageView("/pricing");
		await tracker.pageView("/blog");
		expect(beacon).toHaveBeenCalledTimes(3);
	});

	it("falls back when beacon is unavailable and respects explicit credentials", async () => {
		beacon.mockReturnValue(false);
		await createAnalyticsTracker({ apiBaseURL: "https://collect.test/" }).track(
			"clicked",
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://collect.test/api/data/analytics/events",
			expect.objectContaining({
				method: "POST",
				keepalive: true,
				credentials: "omit",
			}),
		);
		await createAnalyticsTracker({ credentials: "include" }).track("clicked");
		expect(beacon).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenLastCalledWith(
			"/api/data/analytics/events",
			expect.objectContaining({ credentials: "include" }),
		);
	});

	it("does not send with Do Not Track or during server rendering", async () => {
		vi.stubGlobal("navigator", { sendBeacon: beacon, doNotTrack: "1" });
		expect(await createAnalyticsTracker().track("clicked")).toBe(false);
		vi.stubGlobal("window", undefined);
		expect(await createAnalyticsTracker().pageView()).toBe(false);
		expect(beacon).not.toHaveBeenCalled();
	});

	it("uses Fetch for explicit headers and preserves JSON content type case-insensitively", async () => {
		await createAnalyticsTracker({
			headers: { "X-Tenant": "public-tenant", "content-type": "text/plain" },
		}).pageView();
		expect(beacon).not.toHaveBeenCalled();
		const init = fetchMock.mock.calls[0]![1] as RequestInit;
		const headers = new Headers(init.headers);
		expect(headers.get("x-tenant")).toBe("public-tenant");
		expect(headers.get("content-type")).toBe("application/json");
		expect(
			[...headers].filter(([name]) => name === "content-type"),
		).toHaveLength(1);
		expect(init.keepalive).toBe(true);
	});

	it("separates standalone tracker sessions by header values and normalizes header names", async () => {
		await track(
			"first",
			{},
			{ apiBasePath: "/tenant", headers: { "X-Tenant": "one" } },
		);
		await track(
			"second",
			{},
			{ apiBasePath: "/tenant", headers: new Headers({ "x-tenant": "one" }) },
		);
		await track(
			"third",
			{},
			{ apiBasePath: "/tenant", headers: { "x-tenant": "two" } },
		);
		const bodies = fetchMock.mock.calls.map((call) =>
			JSON.parse(String((call[1] as RequestInit).body)),
		);
		expect(bodies[0].sessionId).toBe(bodies[1].sessionId);
		expect(bodies[2].sessionId).not.toBe(bodies[0].sessionId);
	});

	it("keeps cached transport stable when the caller mutates headers and credentials", async () => {
		const headers = new Headers({ "x-tenant": "one" });
		const options = {
			apiBasePath: "/mutable-tenant",
			headers,
			credentials: "omit" as RequestCredentials,
		};
		await track("first", {}, options);
		headers.set("x-tenant", "two");
		options.credentials = "include";
		await track("second", {}, options);
		await track(
			"third",
			{},
			{
				apiBasePath: "/mutable-tenant",
				headers: { "x-tenant": "one" },
				credentials: "omit",
			},
		);
		expect(
			fetchMock.mock.calls.map(([, init]) =>
				new Headers(init.headers).get("x-tenant"),
			),
		).toEqual(["one", "two", "one"]);
		expect(fetchMock.mock.calls.map(([, init]) => init.credentials)).toEqual([
			"omit",
			"include",
			"omit",
		]);
	});

	it("never interrupts navigation on invalid paths, network failure or cyclic properties", async () => {
		const tracker = createAnalyticsTracker({ credentials: "omit" });
		expect(await tracker.pageView("http://[")).toBe(false);
		fetchMock.mockRejectedValue(new Error("offline"));
		expect(await tracker.track("clicked")).toBe(false);
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(
			await tracker.track("clicked", cyclic as Record<string, string>),
		).toBe(false);
	});

	it("reuses a session across standalone track calls with equivalent options", async () => {
		await track("first", {}, { apiBasePath: "/standalone" });
		await track("second", {}, { apiBasePath: "/standalone" });
		expect((await beaconBody(1)).sessionId).toBe(
			(await beaconBody()).sessionId,
		);
	});
});
