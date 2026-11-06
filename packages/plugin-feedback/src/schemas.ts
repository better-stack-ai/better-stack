import { z } from "zod";
import { feedbackStatuses } from "./types";

export const feedbackStatusSchema = z.enum(feedbackStatuses);
export const idSchema = z.object({ id: z.string().min(1).max(200) });
export const listFeedbackPostsSchema = z.object({
	category: z.string().trim().min(1).max(100).optional(),
	status: feedbackStatusSchema.optional(),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export const createFeedbackPostSchema = z.object({
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(20000),
	category: z.string().trim().min(1).max(100).default("General"),
});
export const updateFeedbackStatusSchema = z.object({
	status: feedbackStatusSchema,
});
export const listChangelogSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export const createChangelogEntrySchema = z.object({
	title: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(50000),
	postIds: z
		.array(z.string().min(1).max(200))
		.max(100)
		.transform((ids) => [...new Set(ids)]),
	publishedAt: z.iso.datetime().optional(),
});
