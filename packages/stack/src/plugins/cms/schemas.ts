import { z } from "zod";

/** Default upper bound for a single page when no maxPageSize is configured. */
export const DEFAULT_MAX_PAGE_SIZE = 1000;

/**
 * Factory that creates the list-content query schema with a configurable
 * upper bound on the `limit` parameter.
 *
 * Use this inside the backend plugin factory (where `config.maxPageSize` is
 * available) so the cap is set at registration time rather than hardcoded.
 */
export function createListContentQuerySchema(
	maxPageSize = DEFAULT_MAX_PAGE_SIZE,
) {
	return z.object({
		slug: z.string().optional(),
		limit: z.coerce.number().min(1).max(maxPageSize).optional().default(20),
		offset: z.coerce.number().min(0).optional().default(0),
	});
}

/**
 * Schema for listing content items with pagination.
 * Uses the default maxPageSize (1000).
 *
 * @deprecated Prefer {@link createListContentQuerySchema} inside plugin
 * factories so consumers can configure the upper bound via `maxPageSize`.
 */
export const listContentQuerySchema = createListContentQuerySchema();

/**
 * Schema for creating a content item
 * Note: The actual data validation is done dynamically based on the content type's schema
 */
export const createContentSchema = z.object({
	slug: z.string().min(1, "Slug is required"),
	// Use passthrough object instead of z.record(z.unknown()) due to Zod v4 bug
	data: z.object({}).passthrough(),
});

/**
 * Schema for updating a content item
 * Note: The actual data validation is done dynamically based on the content type's schema
 */
export const updateContentSchema = z.object({
	slug: z.string().min(1, "Slug is required").optional(),
	// Use passthrough object instead of z.record(z.unknown()) due to Zod v4 bug
	data: z.object({}).passthrough().optional(),
});

/**
 * Schema for content type response
 * Note: fieldConfig is no longer included - it's merged into jsonSchema during read
 */
export const contentTypeResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().nullable().optional(),
	jsonSchema: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * Schema for content item response
 */
export const contentItemResponseSchema = z.object({
	id: z.string(),
	contentTypeId: z.string(),
	slug: z.string(),
	data: z.string(),
	authorId: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * Schema for content item with parsed data response
 */
export const contentItemWithDataResponseSchema =
	contentItemResponseSchema.extend({
		// Use passthrough object instead of z.record(z.unknown()) due to Zod v4 bug
		parsedData: z.object({}).passthrough(),
		contentType: contentTypeResponseSchema.optional(),
	});

/**
 * Schema for paginated content items response
 */
export const paginatedContentResponseSchema = z.object({
	items: z.array(contentItemWithDataResponseSchema),
	total: z.number(),
	limit: z.number(),
	offset: z.number(),
});

export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
