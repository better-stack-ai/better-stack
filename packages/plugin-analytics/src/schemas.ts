import { z } from "zod";

const pathSchema = z
	.string()
	.min(1)
	.max(2048)
	.startsWith("/")
	.refine(
		(path) => !path.startsWith("//") && !/[\\\u0000-\u001f]/.test(path),
		"Use a local pathname",
	)
	.transform((path) => path.split(/[?#]/)[0]!);
const dateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** Validated ingestion body. Server time, device, browser and hashed session are authoritative. */
export const AnalyticsPageViewSchema = z.object({
	path: pathSchema,
	referrer: z.string().max(2048).optional(),
	sessionId: z.string().min(16).max(128),
});

/** Custom properties are flat JSON values with bounded size. */
export const AnalyticsEventSchema = AnalyticsPageViewSchema.omit({
	referrer: true,
}).extend({
	name: z.string().trim().min(1).max(100),
	properties: z
		.record(
			z.string().max(100),
			z.union([
				z.string().max(1000),
				z.number().finite(),
				z.boolean(),
				z.null(),
			]),
		)
		.refine(
			(value) => JSON.stringify(value).length <= 4096,
			"Properties exceed 4096 characters",
		)
		.optional(),
});

/** Analytics queries use inclusive start and exclusive end; date-only end includes that day. */
export const AnalyticsRangeSchema = z
	.object({
		range: z.enum(["today", "7d", "30d", "custom"]).default("7d"),
		start: dateSchema.optional(),
		end: dateSchema.optional(),
		path: pathSchema.optional(),
		limit: z.coerce.number().int().min(1).max(100).default(10),
	})
	.superRefine((value, ctx) => {
		if (value.range === "custom" && (!value.start || !value.end))
			ctx.addIssue({
				code: "custom",
				message: "Custom ranges require start and end",
				path: ["start"],
			});
		if (
			value.start &&
			value.end &&
			Date.parse(value.start) > Date.parse(value.end)
		)
			ctx.addIssue({
				code: "custom",
				message: "Start must be before end",
				path: ["end"],
			});
		if (
			value.start &&
			value.end &&
			Date.parse(value.end) - Date.parse(value.start) > 366 * 86400000
		)
			ctx.addIssue({
				code: "custom",
				message: "Date range cannot exceed 366 days",
				path: ["end"],
			});
	});

const experimentKeySchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Explicit anonymous exposure; browser variant labels and identity fields are rejected. */
export const AnalyticsExposureSchema = AnalyticsPageViewSchema.omit({
	referrer: true,
})
	.extend({
		experimentKey: experimentKeySchema,
		expectedConfigurationVersion: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.strict();

/** Protected experiment cohort query. Path filters are not supported for attribution. */
export const AnalyticsExperimentReportSchema = AnalyticsRangeSchema.safeExtend({
	experimentKey: experimentKeySchema,
	path: z.never().optional(),
});

/** Backend experiment definitions are bounded and snapshotted into exposure records. */
export const AnalyticsExperimentDefinitionSchema = z.object({
	key: experimentKeySchema,
	flagKey: experimentKeySchema,
	conversionEvent: z.string().trim().min(1).max(100),
	attributionWindowMs: z.number().int().min(1).max(86400000).default(1800000),
});
