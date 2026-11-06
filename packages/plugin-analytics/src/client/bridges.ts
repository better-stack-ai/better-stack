import { createAnalyticsLifecycleHooks } from "../bridges";
import { track, type AnalyticsTracker } from "./tracker";

/**
 * Adapt lifecycle callbacks to the cookie-free browser tracker. Reuse the same
 * tracker as page views for correlation. Do not also wire the same event on the
 * server; client events are untrusted observations, not payment verification.
 */
export function createAnalyticsClientHooks(
	tracker: Pick<AnalyticsTracker, "track"> = { track },
) {
	return createAnalyticsLifecycleHooks(async (event) => {
		if (
			typeof navigator !== "undefined" &&
			"globalPrivacyControl" in navigator &&
			navigator.globalPrivacyControl === true
		)
			return;
		await tracker.track(event.name, event.properties);
	});
}
