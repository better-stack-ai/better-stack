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
} from "../schemas";
import * as getters from "./getters";
import * as mutations from "./mutations";

/** Sanitized event supplied to ingestion hooks. No raw session or IP is exposed. */
export type AnalyticsIngestEvent = {
	kind: "pageview" | "event";
	path: string;
	sessionId: string;
	timestamp: string;
	name?: string;
	properties?: string;
	referrer?: string;
	device?: string;
	browser?: string;
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

/** Backend analytics configuration. Private endpoints require stack authorization. */
export interface AnalyticsBackendOptions {
	/** Raw event retention in days. @default 90 */
	retentionDays?: number;
	/** Stable server-only secret for hashing anonymous session IDs across restarts and workers. */
	sessionSecret?: string;
	/** Ingestion callbacks, including application-specific filtering and rate limits. */
	hooks?: AnalyticsBackendHooks;
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
