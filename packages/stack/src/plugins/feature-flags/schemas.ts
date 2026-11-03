import { z } from "zod";

/** Stable URL-safe key; reserved JavaScript property names cannot become bulk keys. */
export const flagKeySchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
	.refine(
		(key) => !["new", "constructor", "prototype"].includes(key),
		"Choose another flag key",
	);
export const flagContextSchema = z.object({
	userId: z.string().min(1).max(256).optional(),
	sessionId: z.string().min(1).max(256).optional(),
	email: z.email().max(320).optional(),
	tags: z.array(z.string().min(1).max(100)).max(100).optional(),
});
export const segmentRuleSchema = z
	.object({
		field: z.enum(["userId", "email", "tags"]),
		operator: z.enum(["equals", "contains", "in"]),
		value: z.union([
			z.string().min(1).max(320),
			z.array(z.string().min(1).max(320)).min(1).max(100),
		]),
	})
	.superRefine((rule, ctx) => {
		if (
			rule.operator === "in"
				? !Array.isArray(rule.value)
				: typeof rule.value !== "string"
		)
			ctx.addIssue({
				code: "custom",
				path: ["value"],
				message:
					rule.operator === "in"
						? "Provide a list of values"
						: "Provide one value",
			});
		if (
			(rule.field === "tags" && rule.operator === "equals") ||
			(rule.field !== "tags" && rule.operator === "contains")
		)
			ctx.addIssue({
				code: "custom",
				path: ["operator"],
				message:
					"Use equals or in for users and emails; contains or in for tags",
			});
	});
const flagFields = z.object({
	name: z.string().trim().min(1).max(200),
	description: z.string().max(2000).nullable().optional(),
	type: z.enum(["boolean", "rollout", "segment"]).default("boolean"),
	enabled: z.boolean().default(false),
	rolloutPct: z.number().finite().min(0).max(100).nullable().optional(),
	segments: z.array(segmentRuleSchema).max(50).default([]),
	tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
});
export const flagConfigurationSchema = flagFields.superRefine((flag, ctx) => {
	if (flag.type === "rollout" && flag.rolloutPct == null)
		ctx.addIssue({
			code: "custom",
			path: ["rolloutPct"],
			message: "A rollout percentage is required",
		});
	if (flag.type === "segment" && !flag.segments.length)
		ctx.addIssue({
			code: "custom",
			path: ["segments"],
			message: "Add at least one targeting rule",
		});
});
export const createFlagSchema = flagFields
	.extend({ key: flagKeySchema })
	.superRefine((flag, ctx) => {
		const parsed = flagConfigurationSchema.safeParse(flag);
		if (!parsed.success)
			for (const issue of parsed.error.issues)
				ctx.addIssue({
					code: "custom",
					path: issue.path,
					message: issue.message,
				});
	});
export const updateFlagSchema = z
	.object({
		...flagFields.shape,
		type: flagFields.shape.type.removeDefault(),
		enabled: flagFields.shape.enabled.removeDefault(),
		segments: flagFields.shape.segments.removeDefault(),
		tags: flagFields.shape.tags.removeDefault(),
	})
	.partial()
	.strict();
export const keySchema = z.object({ key: flagKeySchema });
export const listFlagsSchema = z.object({
	includeArchived: z
		.union([
			z.boolean(),
			z.enum(["true", "false"]).transform((value) => value === "true"),
		])
		.default(false),
});
export const evaluateSchema = keySchema.extend({
	context: flagContextSchema.optional(),
});
export const evaluateAllSchema = z.object({
	context: flagContextSchema.optional(),
});
/** Bounded base64 UTF-8 JSON, accepted by both evaluation endpoints. */
export const evaluationQuerySchema = z.object({
	context: z.string().max(32768).optional(),
});

export type CreateFlagInput = z.input<typeof createFlagSchema>;
export type UpdateFlagInput = z.input<typeof updateFlagSchema>;
