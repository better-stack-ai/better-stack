import { segmentRuleSchema, flagVariantsSchema } from "../schemas";
import { z } from "zod";
import type { FeatureFlag, FlagRecord } from "../types";

function parseArray(raw: string, schema: z.ZodType) {
	try {
		const parsed = schema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : [];
	} catch {
		return [];
	}
}

/** Normalize database dates and JSON into transport-safe values. */
export function serializeFlag(flag: FlagRecord): FeatureFlag {
	return {
		...flag,
		description: flag.description ?? null,
		rolloutPct: flag.rolloutPct ?? null,
		variants: parseArray(
			flag.variants || "[]",
			flagVariantsSchema,
		) as FeatureFlag["variants"],
		segments: parseArray(
			flag.segments || "[]",
			z.array(segmentRuleSchema),
		) as FeatureFlag["segments"],
		tags: parseArray(flag.tags || "[]", z.array(z.string())) as string[],
		archivedAt: flag.archivedAt
			? new Date(flag.archivedAt).toISOString()
			: null,
		createdAt: new Date(flag.createdAt).toISOString(),
		updatedAt: new Date(flag.updatedAt).toISOString(),
	};
}
