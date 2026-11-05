import type { DBAdapter as Adapter } from "@btst/db";
import type { FeatureFlag } from "../types";
import { listFlags } from "./getters";

/** One TTL snapshot avoids unbounded per-key cache entries and supports bulk evaluation. */
export function createFlagCache(adapter: Adapter, ttlMs: number) {
	let value: FeatureFlag[] | undefined;
	let expiresAt = 0;
	let generation = 0;
	let pending: Promise<FeatureFlag[]> | undefined;
	async function load(): Promise<FeatureFlag[]> {
		if (value && Date.now() < expiresAt) return value;
		if (pending) return pending;
		const started = generation;
		const reading = listFlags(adapter).then((flags) => {
			if (generation !== started) return load();
			value = flags;
			expiresAt = Date.now() + ttlMs;
			return flags;
		});
		pending = reading;
		try {
			return await reading;
		} finally {
			if (pending === reading) pending = undefined;
		}
	}
	return {
		load,
		invalidate() {
			generation++;
			value = undefined;
			pending = undefined;
		},
	};
}
