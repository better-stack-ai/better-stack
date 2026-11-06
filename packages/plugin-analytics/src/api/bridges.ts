import {
	createAnalyticsLifecycleHooks,
	type AnalyticsBridgeContext,
} from "../bridges";
import type { AnalyticsEventSchema } from "../schemas";
import type { z } from "zod";

/** Server bridge configuration. No cookie or identity-derived session is invented. */
export interface AnalyticsServerBridgeOptions {
	/** Call the configured stack's trusted.analytics.recordEvent operation. */
	recordEvent: (
		event: z.input<typeof AnalyticsEventSchema>,
	) => Promise<unknown>;
	/** Resolve an existing anonymous session, or return null to skip collection without consent. */
	session: (
		context: AnalyticsBridgeContext,
	) => string | null | Promise<string | null>;
}

/**
 * Send source lifecycle events through Analytics' validation, session hashing,
 * retention and ingestion hooks. Errors propagate to the source lifecycle.
 * Request-less hooks (including payment webhooks) need application-owned consent
 * and session correlation; a browser's original session cannot be recovered here.
 */
export function createAnalyticsServerHooks(
	options: AnalyticsServerBridgeOptions,
) {
	return createAnalyticsLifecycleHooks(async (event, context) => {
		if (
			context.request?.headers.get("dnt") === "1" ||
			context.request?.headers.get("sec-gpc") === "1"
		)
			return;
		const sessionId = await options.session(context);
		if (sessionId === null) return;
		await options.recordEvent({ ...event, sessionId });
	});
}
