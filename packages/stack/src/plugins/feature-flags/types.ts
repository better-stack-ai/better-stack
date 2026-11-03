/** Inputs used for targeting and deterministic rollout assignment. */
export type FlagContext = {
	userId?: string;
	sessionId?: string;
	email?: string;
	tags?: string[];
};

/** Rules are combined with AND. Values within an `in` rule are combined with OR. */
export type SegmentRule = {
	field: "userId" | "email" | "tags";
	operator: "equals" | "contains" | "in";
	value: string | string[];
};

/** Transport-safe flag definition. Archived flags always evaluate to false. */
export type FeatureFlag = {
	id: string;
	key: string;
	name: string;
	description: string | null;
	type: "boolean" | "rollout" | "segment";
	enabled: boolean;
	rolloutPct: number | null;
	segments: SegmentRule[];
	tags: string[];
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

/** Database representation; arrays are serialized JSON. */
export type FlagRecord = Omit<
	FeatureFlag,
	"segments" | "tags" | "archivedAt" | "createdAt" | "updatedAt"
> & {
	segments: string;
	tags: string;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

/** Latest evaluation retained in the plugin's bounded in-process buffer. */
export type FlagEvaluation = {
	id: string;
	flagKey: string;
	result: boolean;
	context: FlagContext;
	timestamp: string;
};

export type { CreateFlagInput, UpdateFlagInput } from "./schemas";
