import { z } from "zod";

export const SEARCH_MAX_SOURCES = 8;
export const SEARCH_MAX_RESULTS = 200;
export const SEARCH_MAX_PAGES = 10;
export const searchSourceIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const searchInputSchema = z.object({
	q: z.string().trim().max(200),
	sources: z.preprocess(
		(value) =>
			typeof value === "string" ? value.split(",").filter(Boolean) : value,
		z.array(searchSourceIdSchema).max(SEARCH_MAX_SOURCES).optional(),
	),
	page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGES).default(1),
	limit: z.coerce.number().int().min(1).max(20).default(20),
});

/** Public record bounds shared by providers and client response validation. */
export const searchProviderResultSchema = z.object({
	resourceId: z.string().min(1).max(200),
	title: z.string().min(1).max(500),
	snippet: z.string().max(500),
	href: z
		.string()
		.max(2000)
		.refine(
			(value) =>
				value.startsWith("/") &&
				!value.startsWith("//") &&
				!/[\\\u0000-\u0020]/.test(value),
			"Search destinations must be application-relative paths",
		),
});

/** Validate successful Search responses before rendering or caching them. */
export const searchResponseSchema = z.object({
	items: z
		.array(
			searchProviderResultSchema.extend({
				key: z.string().min(1),
				sourceId: searchSourceIdSchema,
				sourceLabel: z.string().min(1).max(100),
			}),
		)
		.max(20),
	sources: z
		.array(
			z.object({
				id: searchSourceIdSchema,
				label: z.string().min(1).max(100),
			}),
		)
		.max(SEARCH_MAX_SOURCES),
	page: z.number().int().min(1).max(SEARCH_MAX_PAGES),
	limit: z.number().int().min(1).max(20),
	hasMore: z.boolean(),
	nextPage: z.number().int().min(1).max(SEARCH_MAX_PAGES).nullable(),
	truncated: z.boolean(),
});
