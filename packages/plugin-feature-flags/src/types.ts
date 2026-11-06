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

/** JSON values accepted inside a variant's object payload. */
export type FlagJsonValue =
	| string
	| number
	| boolean
	| null
	| FlagJsonValue[]
	| { [key: string]: FlagJsonValue };

/** A weighted alternative delivered only when its flag evaluates to true. */
export type FlagVariant = {
	key: string;
	weight: number;
	payload?: string | number | boolean | Record<string, FlagJsonValue>;
};

/** Public assignment; null means disabled, missing, untargeted, or no variants. */
export type FlagVariantResult = {
	result: boolean;
	variant: string | null;
	payload?: FlagVariant["payload"];
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
	variants: FlagVariant[];
	tags: string[];
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

/** Database representation; arrays are serialized JSON. */
export type FlagRecord = Omit<
	FeatureFlag,
	"segments" | "variants" | "tags" | "archivedAt" | "createdAt" | "updatedAt"
> & {
	segments: string;
	variants: string;
	tags: string;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

/** Latest evaluation retained in the flag's bounded in-process history. */
export type FlagEvaluation = {
	id: string;
	flagKey: string;
	result: boolean;
	variant: string | null;
	context: FlagContext;
	timestamp: string;
};

export type { CreateFlagInput, UpdateFlagInput } from "./schemas";
