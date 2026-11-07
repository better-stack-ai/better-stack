import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DBAdapter } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { featureFlagsBackendPlugin } from "../../../plugin-feature-flags/src/api/plugin";
import { featureFlagsPermissions } from "../../../plugin-feature-flags/src/permissions";
import { analyticsBackendPlugin } from "../api/plugin";
import type { AnalyticsBackendOptions } from "../api/operations";
import { analyticsPermissions } from "../permissions";
import type { AnalyticsExperimentExposure } from "../types";

const sessionId = "anonymous-session-386";
const start = new Date("2026-11-06T12:00:00Z");
const definitions = [
	{
		key: "checkout-test",
		flagKey: "checkout",
		conversionEvent: "purchase",
		attributionWindowMs: 60000,
	},
];

function setup(
	options: Partial<AnalyticsBackendOptions> = {},
	authenticated = false,
	sharedAdapter?: DBAdapter,
	allowReports = authenticated,
) {
	let adapter!: DBAdapter;
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [analyticsPermissions, featureFlagsPermissions],
		rules: ({ analytics }) => [
			analytics.experiments.read.when(() => allowReports),
		],
	});
	const stack = createBackendStack({
		basePath: "/api",
		auth: createServerAuth({
			authorization,
			getIdentity: () => (authenticated ? { id: "admin" } : null),
		}),
		plugins: {
			featureFlags: featureFlagsBackendPlugin({
				cacheTtlMs: 0,
				evaluationLogLimit: 0,
			}),
			analytics: analyticsBackendPlugin({
				sessionSecret: "stable-session-secret-386",
				experiments: {
					definitions,
					resolveVariant: async ({ flagKey, sessionId }) =>
						stack.trusted.featureFlags.evaluateExperimentVariant({
							key: flagKey,
							context: { sessionId },
						}),
				},
				...options,
			}),
		},
		adapter: (db) => {
			adapter = sharedAdapter ?? createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return {
		stack,
		adapter: () => adapter,
		flags: stack.trusted.featureFlags,
		analytics: stack.trusted.analytics,
	};
}

async function flag(flags: ReturnType<typeof setup>["flags"]) {
	return flags.createFlag({
		key: "checkout",
		name: "Checkout",
		enabled: true,
		variants: [
			{ key: "control", weight: 50 },
			{ key: "new", weight: 50 },
		],
	});
}
async function expose(
	analytics: ReturnType<typeof setup>["analytics"],
	flags: ReturnType<typeof setup>["flags"],
	session = sessionId,
	flagKey = "checkout",
) {
	const assignment = await flags.evaluateExperimentVariant({
		key: flagKey,
		context: { sessionId: session },
	});
	return analytics.recordExposure({
		expectedConfigurationVersion:
			assignment.configurationVersion ?? "0".repeat(64),
		experimentKey: "checkout-test",
		path: "/checkout",
		sessionId: session,
	});
}
function convert(
	analytics: ReturnType<typeof setup>["analytics"],
	session = sessionId,
) {
	return analytics.recordEvent({
		name: "purchase",
		path: "/thanks",
		sessionId: session,
	});
}
function request(path: string, body?: unknown) {
	return new Request(`https://example.test/api/analytics/${path}`, {
		method: body ? "POST" : "GET",
		headers: {
			"content-type": "application/json",
			"user-agent": "Mozilla/5.0 Chrome/131.0 Safari/537.36",
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}

afterEach(() => vi.useRealTimers());

describe("opt-in experiment attribution", () => {
	it("preserves deterministic assignment and deduplicates concurrent exposure and conversion retries", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(start);
		const { flags, analytics, adapter } = setup();
		await flag(flags);
		const assigned = await flags.evaluateVariant({
			key: "checkout",
			context: { sessionId },
		});
		await flags.evaluateVariant({ key: "checkout", context: { sessionId } });
		expect(await adapter().findMany({ model: "experimentExposure" })).toEqual(
			[],
		);
		await convert(analytics);
		vi.setSystemTime(new Date(+start + 1000));
		const exposures = await Promise.all([
			expose(analytics, flags),
			expose(analytics, flags),
			expose(analytics, flags),
		]);
		expect(exposures[0]).toMatchObject({
			accepted: true,
			variant: assigned.variant,
		});
		expect(
			exposures.every(
				(item) => JSON.stringify(item) === JSON.stringify(exposures[0]),
			),
		).toBe(true);
		let rows = await adapter().findMany<AnalyticsExperimentExposure>({
			model: "experimentExposure",
		});
		expect(rows).toHaveLength(1);
		expect(JSON.stringify(rows)).not.toContain(sessionId);
		expect(rows[0]?.sessionId).toMatch(/^[a-f0-9]{64}$/);
		vi.setSystemTime(new Date(+start + 2000));
		await convert(analytics);
		await convert(analytics);
		vi.setSystemTime(new Date(+start + 3000));
		const report = await analytics.getExperimentReport({
			experimentKey: "checkout-test",
		});
		expect(report.rows).toEqual([
			expect.objectContaining({
				variant: assigned.variant,
				subjects: 1,
				exposures: 1,
				conversions: 1,
				conversionRate: 100,
			}),
		]);
		rows = await adapter().findMany<AnalyticsExperimentExposure>({
			model: "experimentExposure",
		});
		expect(new Date(rows[0]!.timestamp).getTime()).toBe(+start + 1000);
	});

	it("separates configuration versions and credits only the newest exposed version", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(start);
		const { flags, analytics } = setup();
		await flag(flags);
		const originalAssignment = await flags.evaluateExperimentVariant({
			key: "checkout",
			context: { sessionId },
		});
		const first = await expose(analytics, flags);
		vi.setSystemTime(new Date(+start + 1000));
		await flags.updateFlag({
			key: "checkout",
			data: {
				variants: [
					{ key: "control", weight: 0 },
					{ key: "new", weight: 100 },
				],
			},
		});
		expect(
			await analytics.recordExposure({
				experimentKey: "checkout-test",
				path: "/checkout",
				sessionId,
				expectedConfigurationVersion: originalAssignment.configurationVersion!,
			}),
		).toEqual({ accepted: false });
		const second = await expose(analytics, flags);
		expect(first.configurationVersion).not.toBe(second.configurationVersion);
		vi.setSystemTime(new Date(+start + 2000));
		await convert(analytics);
		vi.setSystemTime(new Date(+start + 3000));
		const report = await analytics.getExperimentReport({
			experimentKey: "checkout-test",
		});
		expect(report.rows).toHaveLength(2);
		expect(
			report.rows.find(
				(row) => row.configurationVersion === first.configurationVersion,
			)?.conversions,
		).toBe(0);
		expect(
			report.rows.find(
				(row) => row.configurationVersion === second.configurationVersion,
			)?.conversions,
		).toBe(1);
	});

	it("does not refresh the first-exposure window and excludes midnight, preexposure, and equal-time conversions", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(start);
		const { flags, analytics } = setup();
		await flag(flags);
		await expose(analytics, flags);
		await convert(analytics);
		vi.setSystemTime(new Date(+start + 59000));
		await expose(analytics, flags);
		vi.setSystemTime(new Date(+start + 61000));
		await convert(analytics);
		vi.setSystemTime(new Date("2026-11-06T23:59:50Z"));
		await expose(analytics, flags, "another-anonymous-session");
		vi.setSystemTime(new Date("2026-11-07T00:00:01Z"));
		await convert(analytics, "another-anonymous-session");
		vi.setSystemTime(new Date("2026-11-07T00:00:02Z"));
		const rows = (
			await analytics.getExperimentReport({ experimentKey: "checkout-test" })
		).rows;
		expect(rows.reduce((sum, row) => sum + row.subjects, 0)).toBe(2);
		expect(rows.reduce((sum, row) => sum + row.exposures, 0)).toBe(2);
		expect(rows.every((row) => row.conversions === 0)).toBe(true);
	});

	it("rejects unconfigured or missing variants and protects reports without exposing individual subjects", async () => {
		const { flags, analytics, stack } = setup();
		expect(await expose(analytics, flags)).toEqual({ accepted: false });
		await flags.createFlag({
			key: "checkout",
			name: "Checkout",
			enabled: true,
		});
		expect(await expose(analytics, flags)).toEqual({ accepted: false });
		expect(
			(await stack.handler(request("experiments?experimentKey=checkout-test")))
				.status,
		).toBe(401);
		expect(
			(
				await stack.handler(
					request("exposures", {
						experimentKey: "checkout-test",
						path: "/",
						sessionId,
						expectedConfigurationVersion: "0".repeat(64),
						variant: "paid",
					}),
				)
			).status,
		).toBe(400);
		const disabled = setup({ experiments: undefined });
		expect(
			(
				await disabled.stack.handler(
					request("exposures", {
						experimentKey: "checkout-test",
						path: "/",
						sessionId,
						expectedConfigurationVersion: "0".repeat(64),
					}),
				)
			).status,
		).toBe(404);
		const denied = setup({}, true, undefined, false);
		expect(
			(
				await denied.stack.handler(
					request("experiments?experimentKey=checkout-test"),
				)
			).status,
		).toBe(403);
		const authorized = setup({}, true);
		const response = await authorized.stack.handler(
			request("experiments?experimentKey=checkout-test"),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			rows: [],
			attribution: "same-session-utc-day",
		});
	});

	it("retains exposure attribution across stack recreation and snapshots changed conversion definitions", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(start);
		const initial = setup();
		await flag(initial.flags);
		const first = await expose(initial.analytics, initial.flags);
		const restarted = setup({}, false, initial.adapter());
		vi.setSystemTime(new Date(+start + 1000));
		await convert(restarted.analytics);
		vi.setSystemTime(new Date(+start + 2000));
		expect(
			(
				await restarted.analytics.getExperimentReport({
					experimentKey: "checkout-test",
				})
			).rows[0],
		).toMatchObject({ conversions: 1 });
		const changed = setup(
			{
				experiments: {
					definitions: [
						{
							...definitions[0]!,
							conversionEvent: "signup",
							attributionWindowMs: 10000,
						},
					],
					resolveVariant: async ({ flagKey, sessionId }) =>
						restarted.flags.evaluateExperimentVariant({
							key: flagKey,
							context: { sessionId },
						}),
				},
			},
			false,
			initial.adapter(),
		);
		const second = await expose(changed.analytics, changed.flags);
		expect(second.configurationVersion).not.toBe(first.configurationVersion);
		vi.setSystemTime(new Date(+start + 3000));
		await convert(changed.analytics);
		await changed.analytics.recordEvent({
			name: "signup",
			path: "/thanks",
			sessionId,
		});
		vi.setSystemTime(new Date(+start + 4000));
		const rows = (
			await changed.analytics.getExperimentReport({
				experimentKey: "checkout-test",
			})
		).rows;
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					conversionEvent: "purchase",
					attributionWindowMs: 60000,
					conversions: 1,
				}),
				expect.objectContaining({
					conversionEvent: "signup",
					attributionWindowMs: 10000,
					conversions: 1,
				}),
			]),
		);
		expect(
			(
				await changed.analytics.getExperimentReport({
					experimentKey: "checkout-test",
					range: "custom",
					start: new Date(+start + 2500).toISOString(),
					end: new Date(+start + 4000).toISOString(),
				})
			).rows,
		).toEqual([]);
		await changed.flags.createFlag({
			key: "checkout-v2",
			name: "Checkout v2",
			enabled: true,
			variants: [{ key: "new", weight: 100 }],
		});
		const remapped = setup(
			{
				experiments: {
					definitions: [{ ...definitions[0]!, flagKey: "checkout-v2" }],
					resolveVariant: async ({ flagKey, sessionId }) =>
						changed.flags.evaluateExperimentVariant({
							key: flagKey,
							context: { sessionId },
						}),
				},
			},
			false,
			initial.adapter(),
		);
		await expose(remapped.analytics, remapped.flags, sessionId, "checkout-v2");
		vi.setSystemTime(new Date(+start + 5000));
		const remappedRows = (
			await remapped.analytics.getExperimentReport({
				experimentKey: "checkout-test",
			})
		).rows;
		expect(new Set(remappedRows.map((row) => row.flagKey))).toEqual(
			new Set(["checkout", "checkout-v2"]),
		);
	});

	it("requires a stable secret for opt-in experiments", () => {
		expect(() =>
			analyticsBackendPlugin({
				experiments: {
					definitions,
					resolveVariant: async () => ({
						variant: null,
						configurationVersion: null,
					}),
				},
			}),
		).toThrow();
	});
});
