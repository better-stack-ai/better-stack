import type { z } from "zod";

/**
 * Configuration for a content type defined by the developer.
 *
 * Field types are now specified directly in the Zod schema via .meta():
 * @example
 * ```typescript
 * const ProductSchema = z.object({
 *   description: z.string().meta({ fieldType: "textarea" }),
 *   image: z.string().optional().meta({ fieldType: "file" }),
 * });
 * ```
 */
export interface ContentTypeConfig {
	/** Display name for the content type (e.g., "Product", "Testimonial") */
	name: string;
	/** URL-friendly slug (e.g., "product", "testimonial") */
	slug: string;
	/** Optional description shown in the admin UI */
	description?: string;
	/** Zod schema defining the content type's fields. Use .meta({ fieldType: "..." }) for field type overrides. */
	schema: z.ZodObject<z.ZodRawShape>;
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
	/** @deprecated Legacy field config - now embedded in jsonSchema. Kept for backwards compat. */
	fieldConfig?: string;
	/** AutoForm schema version. 1 = legacy (separate fieldConfig), 2 = unified (fieldType in jsonSchema) */
	autoFormVersion?: number;
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
 * Content relation stored in the database (junction table)
 * Links source content items to target content items for relationship fields
 */
export type ContentRelation = {
	id: string;
	/** The content item that has the relation field */
	sourceId: string;
	/** The content item being referenced */
	targetId: string;
	/** The field name in the source content type schema (e.g., "categoryIds") */
	fieldName: string;
	createdAt: Date;
};

// ========== Relation Field Types ==========

/**
 * Configuration for a relation field in schema metadata.
 * Use with .meta({ fieldType: "relation", relation: {...} })
 *
 * The schema stores relation values as simple `{ id: string }` references.
 * When `creatable: true`, the frontend sends `{ _new: true, data: {...} }`
 * which the API processes before validation - creating new items and
 * converting them to ID references.
 *
 * @example
 * ```typescript
 * const ResourceSchema = z.object({
 *   // Simple array of ID references - API handles _new items before validation
 *   categoryIds: z.array(z.object({ id: z.string() })).default([]).meta({
 *     fieldType: "relation",
 *     relation: {
 *       type: "manyToMany",
 *       targetType: "category",
 *       displayField: "name",
 *       creatable: true,
 *     },
 *   }),
 * });
 * ```
 */
export interface RelationConfig {
	/** Relation type */
	type: "belongsTo" | "hasMany" | "manyToMany";
	/** Target content type slug */
	targetType: string;
	/** Field to display in the dropdown (e.g., "name", "title") */
	displayField: string;
	/** Allow creating new items inline via modal (default: false) */
	creatable?: boolean;
}

/**
 * Value for a relation field - either a reference to existing item or a new item to create.
 *
 * @example
 * ```typescript
 * // Reference to existing item
 * const existing: RelationValue = { id: "abc123" };
 *
 * // New item to create on save
 * const newItem: RelationValue = {
 *   _new: true,
 *   data: { name: "New Category", description: "..." }
 * };
 * ```
 */
export type RelationValue =
	| { id: string }
	| { _new: true; data: Record<string, unknown> };

/**
 * Represents an inverse relation (content types that reference this type via belongsTo)
 */
export interface InverseRelation {
	/** The content type slug that has the belongsTo relation */
	sourceType: string;
	/** Display name of the source content type */
	sourceTypeName: string;
	/** The field name that contains the belongsTo relation */
	fieldName: string;
	/** Count of items with this relation (when itemId is provided) */
	count: number;
}

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
	/**
	 * Populated relation data (only present when using populated endpoints/hooks).
	 * Keys are field names, values are arrays of related content items.
	 */
	_relations?: Record<string, SerializedContentItemWithType[]>;
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
