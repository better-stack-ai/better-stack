import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import { z } from "zod";
import { analyticsSchema } from "../db";
import {
	AnalyticsEventSchema,
	AnalyticsPageViewSchema,
	AnalyticsRangeSchema,
	AnalyticsExposureSchema,
	AnalyticsExperimentReportSchema,
	AnalyticsExperimentDefinitionSchema,
} from "../schemas";
import {
	createAnalyticsOperations,
	type AnalyticsBackendOptions,
} from "./operations";

export type {
	AnalyticsBackendOptions,
	AnalyticsBackendHooks,
} from "./operations";

/** First-party analytics with public ingestion and authorized dashboard operations. */
export const analyticsBackendPlugin = (
	options: AnalyticsBackendOptions = {},
) => {
	z.number()
		.int()
		.min(1)
		.max(3660)
		.parse(options.retentionDays ?? 90);
	if (options.sessionSecret !== undefined)
		z.string().min(16).parse(options.sessionSecret);
	if (options.experiments) {
		z.string().min(16).parse(options.sessionSecret);
		const definitions = z
			.array(AnalyticsExperimentDefinitionSchema)
			.min(1)
			.max(100)
			.parse(options.experiments.definitions);
		if (
			new Set(definitions.map((definition) => definition.key)).size !==
			definitions.length
		)
			throw new Error("Experiment keys must be unique");
	}
	const secret = options.sessionSecret ?? crypto.randomUUID();
	return defineBackendPlugin({
		id: "analytics",
		dbPlugin: analyticsSchema,
		operations: (adapter) =>
			createAnalyticsOperations(adapter, options, secret),
		routes: (_adapter, _context, operations) => ({
			recordPageView: createEndpoint(
				"/analytics/pageviews",
				{ method: "POST", body: AnalyticsPageViewSchema, requireRequest: true },
				operations.recordPageView.route((ctx) => ctx.body),
			),
			recordEvent: createEndpoint(
				"/analytics/events",
				{ method: "POST", body: AnalyticsEventSchema, requireRequest: true },
				operations.recordEvent.route((ctx) => ctx.body),
			),
			recordExposure: createEndpoint(
				"/analytics/exposures",
				{ method: "POST", body: AnalyticsExposureSchema, requireRequest: true },
				operations.recordExposure.route((ctx) => ctx.body),
			),
			getExperimentReport: createEndpoint(
				"/analytics/experiments",
				{
					method: "GET",
					query: AnalyticsExperimentReportSchema,
					requireRequest: true,
				},
				operations.getExperimentReport.route((ctx) => ctx.query),
			),
			getDashboardStats: createEndpoint(
				"/analytics/dashboard",
				{ method: "GET", query: AnalyticsRangeSchema, requireRequest: true },
				operations.getDashboardStats.route((ctx) => ctx.query),
			),
			getTopPages: createEndpoint(
				"/analytics/pages",
				{ method: "GET", query: AnalyticsRangeSchema, requireRequest: true },
				operations.getTopPages.route((ctx) => ctx.query),
			),
			getTopReferrers: createEndpoint(
				"/analytics/referrers",
				{ method: "GET", query: AnalyticsRangeSchema, requireRequest: true },
				operations.getTopReferrers.route((ctx) => ctx.query),
			),
			getTopEvents: createEndpoint(
				"/analytics/events",
				{ method: "GET", query: AnalyticsRangeSchema, requireRequest: true },
				operations.getTopEvents.route((ctx) => ctx.query),
			),
			getRealtimeVisitors: createEndpoint(
				"/analytics/realtime",
				{ method: "GET", requireRequest: true },
				operations.getRealtimeVisitors.route(() => ({})),
			),
			exportEvents: createEndpoint(
				"/analytics/export",
				{ method: "GET", query: AnalyticsRangeSchema, requireRequest: true },
				operations.exportEvents.route((ctx) => ctx.query),
			),
			cleanupExpiredEvents: createEndpoint(
				"/analytics/retention",
				{ method: "POST", requireRequest: true },
				operations.cleanupExpiredEvents.route(() => ({})),
			),
		}),
	});
};

/** Typed analytics HTTP router. */
export type AnalyticsApiRouter = ReturnType<
	ReturnType<typeof analyticsBackendPlugin>["routes"]
>;
