import type { DBAdapter as Adapter } from "@btst/db";
import type { AnalyticsCustomEvent, AnalyticsPageView } from "../types";

/** Insert an already sanitized view. Callers own validation, hashing, authorization and lifecycle. */
export async function recordPageView(
	adapter: Adapter,
	data: Omit<AnalyticsPageView, "id">,
) {
	return adapter.create<AnalyticsPageView>({ model: "pageView", data });
}

/** Insert an already sanitized event. Callers own validation, hashing, authorization and lifecycle. */
export async function recordEvent(
	adapter: Adapter,
	data: Omit<AnalyticsCustomEvent, "id">,
) {
	return adapter.create<AnalyticsCustomEvent>({ model: "customEvent", data });
}

/** Delete events older than the retention window. Callers own authorization and scheduling. */
export async function cleanupExpiredEvents(
	adapter: Adapter,
	retentionDays = 90,
	now = new Date(),
) {
	const where = [
		{
			field: "timestamp",
			operator: "lt" as const,
			value: new Date(now.getTime() - retentionDays * 86400000),
		},
	];
	const pageViews = await adapter.deleteMany({ model: "pageView", where });
	const customEvents = await adapter.deleteMany({
		model: "customEvent",
		where,
	});
	return { pageViews, customEvents };
}
