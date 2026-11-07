import type { DBAdapter as Adapter } from "@btst/db";
import type {
	AnalyticsCustomEvent,
	AnalyticsPageView,
	AnalyticsExperimentExposure,
} from "../types";

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
	await adapter.deleteMany({ model: "experimentExposure", where });
	return { pageViews, customEvents };
}

const exposureQueues = new WeakMap<Adapter, Promise<unknown>>();

/** First-write exposure. Callers own validation, hashing, authorization and lifecycle. */
export async function recordExperimentExposure(
	adapter: Adapter,
	data: Omit<AnalyticsExperimentExposure, "id">,
) {
	const where = [
		{ field: "dedupKey", value: data.dedupKey, operator: "eq" as const },
	];
	const find = () =>
		adapter.findOne<AnalyticsExperimentExposure>({
			model: "experimentExposure",
			where,
		});
	const previous = exposureQueues.get(adapter) ?? Promise.resolve();
	const writing = previous
		.catch(() => {})
		.then(async () => {
			const existing = await find();
			if (existing) return existing;
			try {
				return await adapter.create<AnalyticsExperimentExposure>({
					model: "experimentExposure",
					data,
				});
			} catch (error) {
				const concurrent = await find();
				if (concurrent) return concurrent;
				throw error;
			}
		});
	exposureQueues.set(adapter, writing);
	try {
		return await writing;
	} finally {
		if (exposureQueues.get(adapter) === writing) exposureQueues.delete(adapter);
	}
}
