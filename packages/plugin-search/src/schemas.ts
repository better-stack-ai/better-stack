import { z } from "zod";

import {
	SEARCH_MAX_PAGES,
	SEARCH_MAX_SOURCES,
	SEARCH_SOURCE_ID_PATTERN,
} from "./constants";
export {
	SEARCH_MAX_SOURCES,
	SEARCH_MAX_RESULTS,
	SEARCH_MAX_PAGES,
} from "./constants";
export {
	searchProviderResultSchema,
	searchResponseSchema,
} from "./response-schema";
export const searchSourceIdSchema = z.string().regex(SEARCH_SOURCE_ID_PATTERN);
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
