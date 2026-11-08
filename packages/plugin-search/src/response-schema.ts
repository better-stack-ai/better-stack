import * as z from "zod/mini";
import {
	SEARCH_MAX_PAGES,
	SEARCH_MAX_SOURCES,
	SEARCH_SOURCE_ID_PATTERN,
} from "./constants";

const sourceId = z.string().check(z.regex(SEARCH_SOURCE_ID_PATTERN));

/** Public record bounds shared by providers and client response validation. */
export const searchProviderResultSchema = z.object({
	resourceId: z.string().check(z.minLength(1), z.maxLength(200)),
	title: z.string().check(z.minLength(1), z.maxLength(500)),
	snippet: z.string().check(z.maxLength(500)),
	href: z.string().check(
		z.maxLength(2000),
		z.refine(
			(value) =>
				value.startsWith("/") &&
				!value.startsWith("//") &&
				!/[\\\u0000-\u0020]/.test(value),
			"Search destinations must be application-relative paths",
		),
	),
});

/** Validate successful Search responses before rendering or caching them. */
export const searchResponseSchema = z.object({
	items: z
		.array(
			z.extend(searchProviderResultSchema, {
				key: z.string().check(z.minLength(1)),
				sourceId,
				sourceLabel: z.string().check(z.minLength(1), z.maxLength(100)),
			}),
		)
		.check(z.maxLength(20)),
	sources: z
		.array(
			z.object({
				id: sourceId,
				label: z.string().check(z.minLength(1), z.maxLength(100)),
			}),
		)
		.check(z.maxLength(SEARCH_MAX_SOURCES)),
	page: z.int().check(z.minimum(1), z.maximum(SEARCH_MAX_PAGES)),
	limit: z.int().check(z.minimum(1), z.maximum(20)),
	hasMore: z.boolean(),
	nextPage: z.nullable(
		z.int().check(z.minimum(1), z.maximum(SEARCH_MAX_PAGES)),
	),
	truncated: z.boolean(),
});
