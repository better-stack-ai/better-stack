import type {
	FeatureFlag,
	FlagContext,
	FlagVariantResult,
	SegmentRule,
} from "./types";

function bucket(key: string, context: FlagContext): number {
	// FNV-1a gives the same bucket in server, browser and edge runtimes.
	let hash = 2166136261;
	for (const char of `${key}:${context.userId ?? context.sessionId ?? "anonymous"}`) {
		hash ^= char.codePointAt(0)!;
		hash = Math.imul(hash, 16777619);
	}
	return ((hash >>> 0) % 10000) / 100;
}

function matchesRule(rule: SegmentRule, context: FlagContext): boolean {
	const actual = context[rule.field];
	if (actual === undefined) return false;
	if (rule.operator === "equals")
		return typeof actual === "string" && actual === rule.value;
	if (rule.operator === "contains")
		return (
			Array.isArray(actual) &&
			typeof rule.value === "string" &&
			actual.includes(rule.value)
		);
	if (rule.operator === "in" && Array.isArray(rule.value)) {
		const values = rule.value;
		return Array.isArray(actual)
			? actual.some((value) => values.includes(value))
			: values.includes(actual);
	}
	return false;
}

/** Pure, edge-safe evaluation. No adapter, network, React, or Node dependency. */
export function evaluateFlag(
	flag: FeatureFlag,
	context: FlagContext = {},
): boolean {
	if (!flag.enabled || flag.archivedAt) return false;
	if (flag.type === "boolean") return true;
	if (flag.type === "rollout") {
		return bucket(flag.key, context) < (flag.rolloutPct ?? 0);
	}
	if (flag.type === "segment")
		return (
			flag.segments.length > 0 &&
			flag.segments.every((rule) => matchesRule(rule, context))
		);
	return false;
}

/** Pure weighted assignment, gated by the existing boolean evaluation. */
export function evaluateFlagVariant(
	flag: FeatureFlag,
	context: FlagContext = {},
): FlagVariantResult {
	const result = evaluateFlag(flag, context);
	if (!result) return { result, variant: null };
	// A separate namespace avoids correlating variant weights with rollout eligibility.
	const position = bucket(`${flag.key}:variant`, context);
	let boundary = 0;
	for (const variant of flag.variants ?? []) {
		boundary += variant.weight;
		if (position < boundary)
			return {
				result,
				variant: variant.key,
				...(variant.payload === undefined
					? {}
					: { payload: structuredClone(variant.payload) }),
			};
	}
	return { result, variant: null };
}
