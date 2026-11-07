import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DBAdapter, defineDb } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { exportFunnel, getFunnel } from "../api/getters";
import { recordEvent, recordPageView } from "../api/mutations";
import { analyticsBackendPlugin } from "../api/plugin";
import { analyticsSchema } from "../db";
import { analyticsPermissions } from "../permissions";
import { AnalyticsFunnelSchema } from "../schemas";
import type { AnalyticsFunnelParams } from "../types";

const now = new Date("2026-11-03T12:00:00Z");
const params: AnalyticsFunnelParams = {
	range: "custom",
	start: "2026-11-02",
	end: "2026-11-03",
	windowMinutes: 30,
	steps: [
		{ type: "pageview", path: "/product", match: "exact" },
		{ type: "event", name: "checkout" },
		{ type: "event", name: "purchase" },
	],
};
const adapter = () =>
	createMemoryAdapter(defineDb({}).use(analyticsSchema))({});
async function row(
	db: DBAdapter,
	sessionId: string,
	minutes: number,
	name = "/product",
) {
	const input = {
		sessionId,
		timestamp: new Date(Date.parse("2026-11-03T10:00:00Z") + minutes * 60000),
		path: name.startsWith("/") ? name : "/product",
	};
	if (name.startsWith("/")) await recordPageView(db, input);
	else await recordEvent(db, { ...input, name });
}

describe("ordered analytics funnels", () => {
	it("sorts events, counts each session once, skips out-of-order steps and keeps incomplete prefixes", async () => {
		const db = adapter();
		for (const [session, minutes, name] of [
			["complete", 2, "purchase"],
			["complete", 0, "/product"],
			["complete", 1, "checkout"],
			["complete", 3, "purchase"],
			["wrong", 0, "purchase"],
			["wrong", 1, "/product"],
			["wrong", 2, "checkout"],
			["partial", 0, "/product"],
			["no-entry", 0, "purchase"],
		] as const)
			await row(db, session, minutes, name);
		const result = await getFunnel(db, params, now);
		expect(result).toMatchObject({
			totalSessions: 3,
			convertedSessions: 1,
			conversionRate: 33.3,
		});
		expect(
			result.steps.map(({ sessions, dropOff, dropOffRate }) => ({
				sessions,
				dropOff,
				dropOffRate,
			})),
		).toEqual([
			{ sessions: 3, dropOff: 0, dropOffRate: 0 },
			{ sessions: 2, dropOff: 1, dropOffRate: 33.3 },
			{ sessions: 1, dropOff: 1, dropOffRate: 50 },
		]);
	});

	it("considers later starts and includes the exact conversion-window edge", async () => {
		const db = adapter();
		for (const [session, minutes, name] of [
			["retry", 0, "/product"],
			["retry", 29, "/product"],
			["retry", 30, "checkout"],
			["retry", 59, "purchase"],
			["edge", 0, "/product"],
			["edge", 1, "checkout"],
			["edge", 30, "purchase"],
			["outside", 0, "/product"],
			["outside", 1, "checkout"],
			["outside", 30 + 1 / 60000, "purchase"],
		] as const)
			await row(db, session, minutes, name);
		expect(
			(await getFunnel(db, params, now)).steps.map((step) => step.sessions),
		).toEqual([3, 3, 2]);
	});

	it("requires separate later timestamps for repeated and simultaneous steps", async () => {
		const db = adapter();
		await row(db, "repeat", 0, "checkout");
		await row(db, "repeat", 0, "checkout");
		await row(db, "repeat", 1, "checkout");
		const repeated = {
			...params,
			steps: [
				{ type: "event", name: "checkout" },
				{ type: "event", name: "checkout" },
				{ type: "event", name: "checkout" },
			],
		} as AnalyticsFunnelParams;
		expect(
			(await getFunnel(db, repeated, now)).steps.map((step) => step.sessions),
		).toEqual([1, 1, 0]);
		await row(db, "tie", 0, "/product");
		await row(db, "tie", 0, "checkout");
		await row(db, "tie", 1, "purchase");
		expect(
			(await getFunnel(db, params, now)).steps.map((step) => step.sessions),
		).toEqual([1, 0, 0]);
	});

	it("partitions UTC days even for identical stored IDs and never looks outside selected or retained bounds", async () => {
		const db = adapter();
		await row(db, "same-id", -601, "/product");
		await row(db, "same-id", -599, "checkout");
		await row(db, "same-id", -598, "purchase");
		expect(
			(await getFunnel(db, params, now)).steps.map((step) => step.sessions),
		).toEqual([1, 0, 0]);
		await row(db, "retained", -133, "/product");
		await row(db, "retained", -132, "checkout");
		await row(db, "retained", -131, "purchase");
		const boundary = new Date("2026-11-03T08:00:00Z");
		const result = await getFunnel(db, params, now, 1 / 6);
		expect(result.start).toBe(boundary.toISOString());
		expect(result.totalSessions).toBe(0);
		const selected = await getFunnel(
			db,
			{ ...params, start: "2026-11-03T07:48:00Z", end: "2026-11-03T07:50:00Z" },
			now,
		);
		expect(selected.totalSessions).toBe(0);
	});

	it("matches literal local path prefixes and event names, and returns stable empty results", async () => {
		const db = adapter();
		const empty = await getFunnel(db, params, now);
		expect(empty).toMatchObject({
			totalSessions: 0,
			convertedSessions: 0,
			conversionRate: 0,
		});
		expect(empty.steps).toEqual(
			params.steps.map((step) => ({
				step,
				sessions: 0,
				conversionRate: 0,
				dropOff: 0,
				dropOffRate: 0,
			})),
		);
		await row(db, "prefix", 0, "/products/1");
		await row(db, "prefix", 1, "purchase");
		const prefix: AnalyticsFunnelParams = {
			...params,
			steps: [
				{ type: "pageview", path: "/products/", match: "prefix" },
				{ type: "event", name: "purchase" },
			],
		};
		expect((await getFunnel(db, prefix, now)).convertedSessions).toBe(1);
		expect(
			(
				await getFunnel(
					db,
					{
						...prefix,
						steps: [prefix.steps[0]!, { type: "event", name: "Purchase" }],
					},
					now,
				)
			).convertedSessions,
		).toBe(0);
	});

	it("rejects invalid definitions, unsafe matchers, oversized ranges and windows", () => {
		for (const invalid of [
			{ ...params, steps: [params.steps[0]] },
			{ ...params, steps: Array(9).fill(params.steps[0]) },
			{
				...params,
				steps: [
					{ type: "pageview", path: "//external", match: "exact" },
					params.steps[1],
				],
			},
			{
				...params,
				steps: [
					{ type: "pageview", path: "/", match: "regex" },
					params.steps[1],
				],
			},
			{ ...params, steps: [{ type: "event", name: "" }, params.steps[1]] },
			{ ...params, windowMinutes: 0 },
			{ ...params, windowMinutes: 1441 },
			{ ...params, windowMinutes: 0.5 },
			{ ...params, start: "2026-09-01", end: "2026-11-03" },
			{ ...params, end: "2026-02-31" },
			{ ...params, end: "2026-11-01" },
			{ ...params, start: undefined },
		])
			expect(AnalyticsFunnelSchema.safeParse(invalid).success).toBe(false);
		expect(
			AnalyticsFunnelSchema.safeParse({
				...params,
				start: "2026-10-04",
				end: "2026-11-03",
			}).success,
		).toBe(true);
	});

	it("caps combined rows with bounded adapter queries and refuses partial reports", async () => {
		const db = adapter();
		const find = vi.spyOn(db, "findMany");
		find.mockResolvedValueOnce(
			Array(20000).fill({
				id: "a",
				path: "/product",
				sessionId: "a",
				timestamp: now,
			}),
		);
		find.mockResolvedValueOnce([
			{
				id: "b",
				name: "purchase",
				path: "/product",
				sessionId: "a",
				timestamp: now,
			},
		]);
		await expect(getFunnel(db, params, now)).rejects.toThrow(/20,000/);
		expect(find.mock.calls.map(([query]) => query.limit)).toEqual([20001, 1]);
		expect(find.mock.calls[0]?.[0].where).toEqual([
			{
				field: "timestamp",
				operator: "gte",
				value: new Date("2026-11-02T00:00:00Z"),
			},
			{
				field: "timestamp",
				operator: "lt",
				value: new Date("2026-11-04T00:00:00Z"),
			},
		]);
	});

	it("protects report and CSV separately from public ingestion, with and without configured auth", async () => {
		for (const withAuth of [true, false]) {
			const authorization = defineAuthorization({
				identity: z.object({ id: z.string() }),
				permissions: [analyticsPermissions],
				rules: () => [],
			});
			const stack = createBackendStack({
				basePath: "/api",
				...(withAuth
					? {
							auth: createServerAuth({
								authorization,
								getIdentity: () => null,
							}),
						}
					: {}),
				plugins: { analytics: analyticsBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
			});
			for (const path of ["funnel", "funnel/export"]) {
				const request = new Request(
					`https://example.test/api/analytics/${path}`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(params),
					},
				);
				expect((await stack.handler(request)).status).toBe(401);
			}
			expect(
				(await stack.trusted.analytics.getFunnel(params)).totalSessions,
			).toBe(0);
			const exported = await stack.trusted.analytics.exportFunnel(params);
			expect(exported.headers.get("content-type")).toContain("text/csv");
		}
		const db = adapter();
		const csv = await exportFunnel(
			db,
			{
				...params,
				steps: [params.steps[0]!, { type: "event", name: "=SUM(1)" }],
			},
			now,
		);
		expect(csv).toContain("'=SUM(1)");
	});

	it("checks authenticated report and export permissions independently and validates HTTP input", async () => {
		for (const role of ["denied", "reader", "exporter"]) {
			const authorization = defineAuthorization({
				identity: z.object({ id: z.string(), role: z.string() }),
				permissions: [analyticsPermissions],
				rules: ({ analytics }) => [
					analytics.dashboard.read.when(
						({ identity }) => identity?.role === "reader",
					),
					analytics.dashboard.export.when(
						({ identity }) => identity?.role === "exporter",
					),
				],
			});
			const stack = createBackendStack({
				basePath: "/api",
				auth: createServerAuth({
					authorization,
					getIdentity: () => ({ id: "user", role }),
				}),
				plugins: { analytics: analyticsBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
			});
			const request = (path: string, input: unknown = params) =>
				new Request(`https://example.test/api/analytics/${path}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(input),
				});
			expect((await stack.handler(request("funnel"))).status).toBe(
				role === "reader" ? 200 : 403,
			);
			expect((await stack.handler(request("funnel/export"))).status).toBe(
				role === "exporter" ? 200 : 403,
			);
			expect(
				(
					await stack.handler(
						request("funnel", { ...params, windowMinutes: 0 }),
					)
				).status,
			).toBe(400);
		}
	});
});
