import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	definePassthroughOperation,
	type DeepReadonly,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { analyticsPermissions } from "../permissions";
import {
	AnalyticsEventSchema,
	AnalyticsFunnelSchema,
	AnalyticsPageViewSchema,
	AnalyticsRangeSchema,
	AnalyticsExposureSchema,
	AnalyticsExperimentReportSchema,
	AnalyticsExperimentDefinitionSchema,
} from "../schemas";
import type { AnalyticsExperimentDefinition } from "../types";
import * as getters from "./getters";
import * as mutations from "./mutations";

/** Sanitized event supplied to ingestion hooks. No raw session or IP is exposed. */
export type AnalyticsIngestEvent = {
	kind: "pageview" | "event" | "exposure";
	path: string;
	sessionId: string;
	timestamp: string;
	name?: string;
	properties?: string;
	referrer?: string;
	device?: string;
	browser?: string;
	experimentKey?: string;
	variant?: string;
	configurationVersion?: string;
};

/** Ingestion lifecycle context. Use the request for application-specific rate limits. */
export type AnalyticsIngestContext = { readonly request?: Request };

/** Post-authorization ingestion callbacks. Throw from onBeforeIngest to reject an event. */
export interface AnalyticsBackendHooks {
	onBeforeIngest?: (
		event: DeepReadonly<AnalyticsIngestEvent>,
		context: AnalyticsIngestContext,
	) => Promise<void> | void;
	onAfterIngest?: (
		event: DeepReadonly<AnalyticsIngestEvent>,
		context: AnalyticsIngestContext,
	) => Promise<void> | void;
}

/** Optional bridge. Resolve only server-owned flag assignment; no raw targeting identity is persisted. */
export interface AnalyticsExperimentsOptions {
	definitions: AnalyticsExperimentDefinition[];
	resolveVariant: (context: {
		flagKey: string;
		sessionId: string;
		request?: Request;
	}) => Promise<{
		variant: string | null;
		configurationVersion: string | null;
	}>;
}

/** Backend analytics configuration. Private endpoints require stack authorization. */
export interface AnalyticsBackendOptions {
	/** Raw event retention in days. @default 90 */
	retentionDays?: number;
	/** Stable server-only secret for hashing anonymous session IDs across restarts and workers. */
	sessionSecret?: string;
	/** Ingestion callbacks, including application-specific filtering and rate limits. */
	hooks?: AnalyticsBackendHooks;
	/** Explicit exposure bridge. Requires a stable sessionSecret and both plugins configured by the host. */
	experiments?: AnalyticsExperimentsOptions;
}

function requirePrivateAccess(context: {
	request?: Request;
	identity: unknown;
}) {
	if (context.request && !context.identity)
		throw new OperationHttpError(
			401,
			"Sign in to view analytics",
			"ANALYTICS_AUTH_REQUIRED",
		);
}

function browserDetails(request?: Request) {
	const agent = request?.headers.get("user-agent") ?? "";
	const isBot =
		!!request &&
		(!/(Mozilla\/|Chrome\/|Safari\/|Firefox\/|Edg\/|Opera\/)/i.test(agent) ||
			/bot|crawler|spider|headless|lighthouse|slurp|preview|curl|wget/i.test(
				agent,
			));
	const device = /iPad|Tablet|Android(?!.*Mobile)/i.test(agent)
		? "tablet"
		: /Mobile|iPhone|Android/i.test(agent)
			? "mobile"
			: "desktop";
	const browser = /Edg\//.test(agent)
		? "Edge"
		: /Firefox\//.test(agent)
			? "Firefox"
			: /Chrome\//.test(agent)
				? "Chrome"
				: /Safari\//.test(agent)
					? "Safari"
					: "Other";
	return { isBot, device, browser };
}

function referrerHost(value: string | undefined, request?: Request) {
	if (!value) return undefined;
	try {
		const url = new URL(value);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			(request && url.host === new URL(request.url).host)
		)
			return undefined;
		return url.hostname;
	} catch {
		return undefined;
	}
}

async function sessionHash(sessionId: string, secret: string, now: Date) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(
			JSON.stringify([secret, now.toISOString().slice(0, 10), sessionId]),
		),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/** One operation inventory shared by HTTP, request calls and trusted jobs. */
export function createAnalyticsOperations(
	adapter: Adapter,
	options: AnalyticsBackendOptions,
	secret: string,
) {
	const retentionDays = options.retentionDays ?? 90;
	const experiments =
		options.experiments?.definitions.map((definition) =>
			AnalyticsExperimentDefinitionSchema.parse(definition),
		) ?? [];
	function requireExperiment(key: string) {
		const definition = experiments.find((item) => item.key === key);
		if (!definition || !options.experiments)
			throw new OperationHttpError(
				404,
				"Experiment is not configured",
				"EXPERIMENT_NOT_CONFIGURED",
			);
		return definition;
	}
	async function ingest(
		input: DeepReadonly<
			| z.output<typeof AnalyticsPageViewSchema>
			| z.output<typeof AnalyticsEventSchema>
		>,
		kind: "pageview" | "event",
		request?: Request,
	) {
		const details = browserDetails(request);
		if (details.isBot) return { accepted: false };
		const now = new Date();
		const sessionId = await sessionHash(input.sessionId, secret, now);
		const event: AnalyticsIngestEvent = {
			kind,
			path: input.path,
			sessionId,
			timestamp: now.toISOString(),
			...(kind === "event" && "name" in input
				? {
						name: input.name,
						properties: input.properties
							? JSON.stringify(input.properties)
							: undefined,
					}
				: {}),
			...(kind === "pageview"
				? {
						referrer: referrerHost(
							"referrer" in input
								? input.referrer
								: (request?.headers.get("referer") ?? undefined),
							request,
						),
						device: details.device,
						browser: details.browser,
					}
				: {}),
		};
		const snapshot = Object.freeze(event);
		const context = Object.freeze({ ...(request ? { request } : {}) });
		await options.hooks?.onBeforeIngest?.(snapshot, context);
		await mutations.cleanupExpiredEvents(adapter, retentionDays, now);
		if (kind === "pageview")
			await mutations.recordPageView(adapter, {
				path: event.path,
				sessionId,
				timestamp: now,
				referrer: event.referrer,
				device: event.device,
				browser: event.browser,
			});
		else
			await mutations.recordEvent(adapter, {
				name: event.name!,
				path: event.path,
				properties: event.properties,
				sessionId,
				timestamp: now,
			});
		await options.hooks?.onAfterIngest?.(snapshot, context);
		return { accepted: true };
	}
	return {
		recordPageView: defineOperation({
			input: AnalyticsPageViewSchema,
			permission: analyticsPermissions.events.ingest,
			access: "public",
			facts: () => ({ kind: "pageview" as const }),
			execute: ({ input, request }) => ingest(input, "pageview", request),
		}),
		recordEvent: defineOperation({
			input: AnalyticsEventSchema,
			permission: analyticsPermissions.events.ingest,
			access: "public",
			facts: () => ({ kind: "event" as const }),
			execute: ({ input, request }) => ingest(input, "event", request),
		}),
		recordExposure: defineOperation({
			input: AnalyticsExposureSchema,
			permission: analyticsPermissions.experiments.expose,
			access: "public",
			facts: ({ input }) => ({ experimentKey: input.experimentKey }),
			execute: async ({ input, request }) => {
				const definition = requireExperiment(input.experimentKey);
				if (
					browserDetails(request).isBot ||
					request?.headers.get("dnt") === "1" ||
					request?.headers.get("sec-gpc") === "1"
				)
					return { accepted: false };
				const now = new Date();
				const assignment = await options.experiments!.resolveVariant({
					flagKey: definition.flagKey,
					sessionId: input.sessionId,
					request,
				});
				if (
					assignment.variant === null ||
					assignment.configurationVersion === null ||
					assignment.configurationVersion !== input.expectedConfigurationVersion
				)
					return { accepted: false };
				const variant = z.string().min(1).max(100).parse(assignment.variant);
				const flagVersion = z
					.string()
					.regex(/^[a-f0-9]{64}$/)
					.parse(assignment.configurationVersion);
				const configurationVersion = await sessionHash(
					JSON.stringify([
						flagVersion,
						definition.flagKey,
						definition.conversionEvent,
						definition.attributionWindowMs,
					]),
					"experiment-definition-v1",
					new Date(0),
				);
				const sessionId = await sessionHash(input.sessionId, secret, now);
				const dedupKey = await sessionHash(
					JSON.stringify([definition.key, configurationVersion, sessionId]),
					"experiment-exposure-v1",
					new Date(0),
				);
				const snapshot = Object.freeze({
					kind: "exposure" as const,
					path: input.path,
					sessionId,
					timestamp: now.toISOString(),
					experimentKey: definition.key,
					variant,
					configurationVersion,
				});
				const hookContext = Object.freeze({ ...(request ? { request } : {}) });
				await options.hooks?.onBeforeIngest?.(snapshot, hookContext);
				await mutations.cleanupExpiredEvents(adapter, retentionDays, now);
				const exposure = await mutations.recordExperimentExposure(adapter, {
					dedupKey,
					experimentKey: definition.key,
					flagKey: definition.flagKey,
					configurationVersion,
					variant,
					conversionEvent: definition.conversionEvent,
					attributionWindowMs: definition.attributionWindowMs,
					path: input.path,
					sessionId,
					timestamp: now,
				});
				await options.hooks?.onAfterIngest?.(snapshot, hookContext);
				return {
					accepted: true,
					variant: exposure.variant,
					configurationVersion: exposure.configurationVersion,
				};
			},
		}),
		getExperimentReport: defineOperation({
			input: AnalyticsExperimentReportSchema,
			permission: analyticsPermissions.experiments.read,
			facts: ({ input }) => ({ experimentKey: input.experimentKey }),
			before: requirePrivateAccess,
			execute: async ({ input }) => {
				const definition = requireExperiment(input.experimentKey);
				const report = await getters.getExperimentReport(
					adapter,
					input,
					new Date(),
					retentionDays,
				);
				return { ...report, flagKey: report.flagKey || definition.flagKey };
			},
		}),
		getDashboardStats: defineOperation({
			input: AnalyticsRangeSchema,
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) => ({
				...(await getters.getDashboardStats(
					adapter,
					input,
					new Date(),
					retentionDays,
				)),
			}),
		}),
		getFunnel: defineOperation({
			input: AnalyticsFunnelSchema,
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: ({ input }) =>
				getters.getFunnel(adapter, input, new Date(), retentionDays),
		}),
		exportFunnel: definePassthroughOperation({
			input: AnalyticsFunnelSchema,
			permission: analyticsPermissions.dashboard.export,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) =>
				new Response(
					await getters.exportFunnel(adapter, input, new Date(), retentionDays),
					{
						headers: {
							"content-type": "text/csv; charset=utf-8",
							"content-disposition":
								'attachment; filename="analytics-funnel.csv"',
							"cache-control": "private, no-store",
						},
					},
				),
		}),
		getTopPages: defineOperation({
			input: AnalyticsRangeSchema,
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) =>
				(
					await getters.getTopPages(adapter, input, new Date(), retentionDays)
				).map((row) => ({ ...row })),
		}),
		getTopReferrers: defineOperation({
			input: AnalyticsRangeSchema,
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) =>
				(
					await getters.getTopReferrers(
						adapter,
						input,
						new Date(),
						retentionDays,
					)
				).map((row) => ({ ...row })),
		}),
		getTopEvents: defineOperation({
			input: AnalyticsRangeSchema,
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) =>
				(
					await getters.getTopEvents(adapter, input, new Date(), retentionDays)
				).map((row) => ({ ...row })),
		}),
		getRealtimeVisitors: defineOperation({
			input: z.object({}),
			permission: analyticsPermissions.dashboard.read,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: () =>
				getters.getRealtimeVisitors(adapter, new Date(), retentionDays),
		}),
		exportEvents: definePassthroughOperation({
			input: AnalyticsRangeSchema,
			permission: analyticsPermissions.dashboard.export,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: async ({ input }) =>
				new Response(
					await getters.exportEvents(adapter, input, new Date(), retentionDays),
					{
						headers: {
							"content-type": "text/csv; charset=utf-8",
							"content-disposition":
								'attachment; filename="analytics-events.csv"',
							"cache-control": "private, no-store",
						},
					},
				),
		}),
		cleanupExpiredEvents: defineOperation({
			input: z.object({}),
			permission: analyticsPermissions.events.cleanup,
			facts: () => ({}),
			before: requirePrivateAccess,
			execute: () => mutations.cleanupExpiredEvents(adapter, retentionDays),
		}),
	};
}
