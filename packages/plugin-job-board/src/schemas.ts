import { z } from "zod";
import type { ContentTypeConfig } from "@btst/plugin-cms/api";

/** CMS fields shared by job management and the public job board. */
export const jobSchema = z.object({
	title: z.string().trim().min(1).max(200),
	department: z.string().trim().min(1).max(200),
	location: z.string().trim().min(1).max(200),
	employmentType: z
		.enum(["full-time", "part-time", "contract", "internship"])
		.meta({ fieldType: "select" }),
	remote: z.boolean().default(false),
	description: z.string().min(1).max(100_000).meta({ fieldType: "markdown" }),
	requirements: z.string().max(100_000).meta({ fieldType: "markdown" }),
	salary: z.string().max(500).optional(),
	closingDate: z.iso.date().nullable().optional().meta({ fieldType: "date" }),
	applicationFormId: z.string().max(200).optional(),
	status: z
		.enum(["draft", "published", "archived"])
		.default("draft")
		.meta({ fieldType: "select" }),
});

/** Content type registered on the existing CMS backend; creates no new models. */
export const JOB_BOARD_CONTENT_TYPE: ContentTypeConfig = {
	name: "Job Posting",
	slug: "job-posting",
	description: "Careers and job board postings",
	schema: jobSchema,
};

/** Canonical CMS content-type slug for job postings. */
export const JOB_BOARD_TYPE_SLUG = "job-posting" as const;

const optionalFilter = z.string().trim().max(200).optional();
/** Validated public filtering and pagination; publication controls are never accepted. */
export const jobsQuerySchema = z.object({
	department: optionalFilter,
	location: optionalFilter,
	employmentType: z
		.enum(["full-time", "part-time", "contract", "internship"])
		.optional(),
	remote: z.preprocess(
		(value) => (value === "true" ? true : value === "false" ? false : value),
		z.boolean().optional(),
	),
	search: optionalFilter,
	limit: z.coerce.number().int().min(1).max(100).default(12),
	offset: z.coerce.number().int().min(0).default(0),
});
