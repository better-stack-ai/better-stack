import type { z } from "zod";
import type { AutoFormFieldType } from "@workspace/ui/components/auto-form/types";

/**
 * Configuration for a content type defined by the developer
 */
export interface ContentTypeConfig {
	/** Display name for the content type (e.g., "Product", "Testimonial") */
	name: string;
	/** URL-friendly slug (e.g., "product", "testimonial") */
	slug: string;
	/** Optional description shown in the admin UI */
	description?: string;
	/** Zod schema defining the content type's fields */
	schema: z.ZodObject<z.ZodRawShape>;
	/**
	 * Optional field configuration for AutoForm customization.
	 *
	 * fieldType can be:
	 * - A built-in AutoForm type: "checkbox", "date", "select", "radio", "switch", "textarea", "number", "file", "fallback"
	 * - A custom type name that maps to a component provided via `fieldComponents` in overrides
	 */
	fieldConfig?: Record<
		string,
		{
			fieldType?: AutoFormFieldType | (string & {});
		}
	>;
}

/**
 * Content type stored in the database
 */
export type ContentType = {
	id: string;
	/** Display name */
	name: string;
	/** URL-friendly slug - unique identifier */
	slug: string;
	/** Optional description */
	description?: string;
	/** JSON Schema representation of the Zod schema (stringified) */
	jsonSchema: string;
	/** Optional field configuration JSON (stringified) */
	fieldConfig?: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Content item stored in the database
 */
export type ContentItem = {
	id: string;
	/** Reference to the content type */
	contentTypeId: string;
	/** URL-friendly slug - unique within content type */
	slug: string;
	/** JSON data matching the content type's schema (stringified) */
	data: string;
	/** Optional author ID for tracking who created/modified */
	authorId?: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Content item with its content type joined
 */
export type ContentItemWithType = ContentItem & {
	contentType?: ContentType;
};

/**
 * Serialized content type for API responses (dates as strings)
 */
export interface SerializedContentType
	extends Omit<ContentType, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
}

/**
 * Serialized content item for API responses (dates as strings)
 */
export interface SerializedContentItem
	extends Omit<ContentItem, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
}

/**
 * Serialized content item with parsed data and joined content type
 * @template TData - The type of the parsed data (defaults to Record<string, unknown>)
 */
export interface SerializedContentItemWithType<TData = Record<string, unknown>>
	extends SerializedContentItem {
	/** Parsed data object (JSON.parse of data field) */
	parsedData: TData;
	/** Joined content type */
	contentType?: SerializedContentType;
}

/**
 * Paginated list response for content items
 * @template TData - The type of the parsed data (defaults to Record<string, unknown>)
 */
export interface PaginatedContentItems<TData = Record<string, unknown>> {
	items: SerializedContentItemWithType<TData>[];
	total: number;
	limit: number;
	offset: number;
}

/**
 * Type helper to define a map of content type slugs to their data types.
 * Use with z.infer to get the type from your Zod schemas.
 *
 * @example
 * ```typescript
 * import { z } from "zod"
 *
 * // Define your schemas
 * export const ProductSchema = z.object({
 *   name: z.string(),
 *   price: z.number(),
 * })
 *
 * export const TestimonialSchema = z.object({
 *   author: z.string(),
 *   quote: z.string(),
 * })
 *
 * // Create the type map
 * export type MyCMSTypes = {
 *   product: z.infer<typeof ProductSchema>
 *   testimonial: z.infer<typeof TestimonialSchema>
 * }
 *
 * // Use in hooks for type-safe parsedData
 * const { items } = useContent<MyCMSTypes, "product">("product")
 * // items[0].parsedData.name is typed as string
 * // items[0].parsedData.price is typed as number
 * ```
 */
export type CMSContentTypeMap = Record<string, Record<string, unknown>>;

/**
 * Context passed to CMS backend hooks
 */
export interface CMSHookContext {
	/** Content type slug */
	typeSlug: string;
	/** User ID if authenticated */
	userId?: string;
	/** Request headers */
	headers?: Headers;
}

/**
 * Hooks for customizing CMS backend behavior
 */
export interface CMSBackendHooks {
	/** Called before creating a content item */
	onBeforeCreate?: (
		data: Record<string, unknown>,
		context: CMSHookContext,
	) =>
		| Promise<Record<string, unknown> | false>
		| Record<string, unknown>
		| false;

	/** Called after creating a content item */
	onAfterCreate?: (
		item: SerializedContentItem,
		context: CMSHookContext,
	) => Promise<void> | void;

	/** Called before updating a content item */
	onBeforeUpdate?: (
		id: string,
		data: Record<string, unknown>,
		context: CMSHookContext,
	) =>
		| Promise<Record<string, unknown> | false>
		| Record<string, unknown>
		| false;

	/** Called after updating a content item */
	onAfterUpdate?: (
		item: SerializedContentItem,
		context: CMSHookContext,
	) => Promise<void> | void;

	/** Called before deleting a content item */
	onBeforeDelete?: (
		id: string,
		context: CMSHookContext,
	) => Promise<boolean> | boolean;

	/** Called after deleting a content item */
	onAfterDelete?: (id: string, context: CMSHookContext) => Promise<void> | void;

	/** Called on any CMS error */
	onError?: (
		error: Error,
		operation: "create" | "update" | "delete" | "list" | "get",
		context: CMSHookContext,
	) => Promise<void> | void;
}

/**
 * Configuration for the CMS backend plugin
 */
export interface CMSBackendConfig {
	/** Content types defined by the developer */
	contentTypes: ContentTypeConfig[];
	/** Optional hooks for customizing behavior */
	hooks?: CMSBackendHooks;
}
