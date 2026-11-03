import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DBAdapter, defineDb } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { analyticsBackendPlugin } from "../api/plugin";
import { analyticsSchema } from "../db";
import { analyticsPermissions } from "../permissions";
import { AnalyticsRangeSchema } from "../schemas";
import {
	exportEvents,
	getDashboardStats,
	getRealtimeVisitors,
} from "../api/getters";
import {
	cleanupExpiredEvents,
	recordEvent,
	recordPageView,
} from "../api/mutations";
import type { AnalyticsBackendOptions } from "../api/operations";
import type { AnalyticsPageView } from "../types";

const browserAgent = "Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36";
const sessionId = "anonymous-browser-session-123";
const now = new Date("2026-11-03T12:00:00Z");

function setup(options: AnalyticsBackendOptions = {}, withAuth = true) {
	let adapter!: DBAdapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [analyticsPermissions],
		rules: () => [],
	});
	const stack = createBackendStack({
		basePath: "/api",
		...(withAuth
			? { auth: createServerAuth({ authorization, getIdentity: () => null }) }
			: {}),
		plugins: {
			analytics: analyticsBackendPlugin({
				sessionSecret: "analytics-server-secret-123",
				...options,
			}),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return { stack, adapter: () => adapter, operations: stack.trusted.analytics };
}

function request(path: string, body?: unknown, userAgent = browserAgent) {
	return new Request(`https://example.test/api/analytics/${path}`, {
		method: body ? "POST" : "GET",
		headers: {
			"user-agent": userAgent,
			"content-type": "application/json",
			"x-forwarded-for": "192.168.1.234",
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}

describe("analytics backend", () => {
	it("accepts anonymous browser ingestion, strips query/referrer details, and stores only daily session hashes", async () => {
		const before = vi.fn();
		const after = vi.fn();
		const { stack, adapter } = setup({
			hooks: { onBeforeIngest: before, onAfterIngest: after },
		});
		const response = await stack.handler(
			request("pageviews", {
				path: "/docs?token=secret#fragment",
				referrer: "https://search.example/query?private=yes",
				sessionId,
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ accepted: true });
		const rows = await adapter().findMany<AnalyticsPageView>({
			model: "pageView",
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			path: "/docs",
			referrer: "search.example",
			sessionId: expect.stringMatching(/^[a-f0-9]{64}$/),
			device: "desktop",
			browser: "Chrome",
		});
		expect(JSON.stringify(rows)).not.toMatch(
			/192\.168|anonymous-browser|token=|private=yes|Mozilla/,
		);
		expect(before).toHaveBeenCalledOnce();
		expect(after).toHaveBeenCalledOnce();
		expect(before.mock.calls[0]?.[0].sessionId).toBe(rows[0]?.sessionId);
	});

	it("filters crawlers and non-browser agents and validates public ingestion", async () => {
		const { stack, adapter } = setup();
		for (const agent of [
			"Googlebot",
			"curl/8",
			"Mozilla/5.0 compatible; bingbot/2.0",
			"Mozilla/5.0 HeadlessChrome/131.0",
		]) {
			const response = await stack.handler(
				request("pageviews", { path: "/", sessionId }, agent),
			);
			expect(await response.json()).toEqual({ accepted: false });
		}
		expect(await adapter().findMany({ model: "pageView" })).toEqual([]);
		expect(
			(
				await stack.handler(
					request("pageviews", { path: "https://private.example", sessionId }),
				)
			).status,
		).toBe(400);
		expect(
			(
				await stack.handler(
					request("events", {
						path: "/",
						sessionId,
						name: "click",
						properties: { payload: "x".repeat(5000) },
					}),
				)
			).status,
		).toBe(400);
	});

	it("protects all reads, CSV and retention even when no stack auth is configured", async () => {
		for (const withAuth of [true, false]) {
			const { stack, operations } = setup({}, withAuth);
			for (const path of [
				"dashboard",
				"pages",
				"referrers",
				"events",
				"realtime",
				"export",
			])
				expect((await stack.handler(request(path))).status).toBe(401);
			expect((await stack.handler(request("retention", {}))).status).toBe(401);
			expect(await operations.getDashboardStats({})).toMatchObject({
				uniqueVisitors: 0,
				pageViews: 0,
				bounceRate: 0,
			});
		}
	});

	it("aggregates unique visitors, UTC day buckets, session gaps, top traffic and custom events", async () => {
		const adapter = createMemoryAdapter(defineDb({}).use(analyticsSchema))({});
		for (const view of [
			{
				path: "/docs",
				sessionId: "a",
				timestamp: new Date("2026-11-03T10:00:00Z"),
				referrer: "search.example",
			},
			{
				path: "/guide",
				sessionId: "a",
				timestamp: new Date("2026-11-03T10:02:00Z"),
			},
			{
				path: "/docs",
				sessionId: "a",
				timestamp: new Date("2026-11-03T11:00:00Z"),
			},
			{
				path: "/docs",
				sessionId: "b",
				timestamp: new Date("2026-11-02T23:50:00Z"),
			},
		])
			await recordPageView(adapter, view);
		await recordEvent(adapter, {
			name: "signup",
			path: "/docs",
			sessionId: "a",
			timestamp: new Date("2026-11-03T10:01:00Z"),
			properties: '{"plan":"pro"}',
		});
		const stats = await getDashboardStats(adapter, { range: "7d" }, now);
		expect(stats).toMatchObject({
			uniqueVisitors: 2,
			pageViews: 4,
			bounceRate: 66.7,
			sessionDuration: 40,
			topEvents: [{ name: "signup", count: 1 }],
		});
		expect(stats.series).toHaveLength(7);
		expect(stats.series.at(-1)).toEqual({
			date: "2026-11-03",
			pageViews: 3,
			visitors: 1,
		});
		expect(stats.topPages[0]).toMatchObject({
			path: "/docs",
			views: 3,
			visitors: 2,
			trend: [0, 0, 0, 0, 0, 1, 2],
		});
		expect(stats.topReferrers).toContainEqual({
			referrer: "search.example",
			views: 1,
			visitors: 1,
		});
		expect(
			(
				await getDashboardStats(
					adapter,
					{ range: "today", path: "/guide" },
					now,
				)
			).pageViews,
		).toBe(1);
	});

	it("enforces retention on reads and ingestion and escapes CSV formula cells", async () => {
		const { adapter, operations } = setup({ retentionDays: 1 });
		await recordPageView(adapter(), {
			path: "/old",
			sessionId: "old",
			timestamp: new Date(Date.now() - 3 * 86400000),
		});
		await recordEvent(adapter(), {
			name: '=HYPERLINK("https://example.test")',
			path: "/",
			sessionId: "new",
			timestamp: new Date(Date.now() - 1000),
		});
		expect(
			(await operations.getDashboardStats({ range: "30d" })).pageViews,
		).toBe(0);
		const csv = await exportEvents(adapter(), {}, new Date());
		expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
		await operations.recordPageView({ path: "/new", sessionId });
		expect(await adapter().findMany({ model: "pageView" })).toHaveLength(1);
		expect(await cleanupExpiredEvents(adapter(), 1)).toMatchObject({
			pageViews: 0,
			customEvents: 0,
		});
	});

	it("counts only the last five minutes as realtime and validates custom calendar dates", async () => {
		const adapter = createMemoryAdapter(defineDb({}).use(analyticsSchema))({});
		for (const [id, minutes] of [
			["a", 1],
			["a", 2],
			["b", 6],
		] as const)
			await recordPageView(adapter, {
				path: "/",
				sessionId: id,
				timestamp: new Date(now.getTime() - minutes * 60000),
			});
		expect(await getRealtimeVisitors(adapter, now)).toEqual({ visitors: 1 });
		expect(
			AnalyticsRangeSchema.safeParse({
				range: "custom",
				start: "2026-02-31",
				end: "2026-03-02",
			}).success,
		).toBe(false);
		expect(
			AnalyticsRangeSchema.safeParse({
				range: "custom",
				start: "2026-11-03",
				end: "2026-11-02",
			}).success,
		).toBe(false);
		expect(AnalyticsRangeSchema.safeParse({ range: "custom" }).success).toBe(
			false,
		);
	});
});
