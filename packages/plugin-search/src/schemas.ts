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
