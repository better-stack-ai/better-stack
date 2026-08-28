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
	/** Parsed data object (JSON.parse of data field). */
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

/** JSON-safe values accepted at the CMS operation boundary. */
export type CMSOperationData =
	| string
	| number
	| boolean
	| null
	| readonly CMSOperationData[]
	| { readonly [key: string]: CMSOperationData };

/** @deprecated Use the operation-specific CMS lifecycle contexts instead. */
export interface CMSHookContext {
	readonly typeSlug: string;
	readonly userId?: string;
	readonly headers?: Headers;
}

interface CMSOperationIdentity {
	readonly id: string;
	readonly [key: string]: unknown;
}

type CMSDeepReadonly<T> = T extends (...args: any[]) => unknown
	? T
	: T extends readonly unknown[]
		? { readonly [TKey in keyof T]: CMSDeepReadonly<T[TKey]> }
		: T extends object
			? { readonly [TKey in keyof T]: CMSDeepReadonly<T[TKey]> }
			: T;

interface CMSOperationContextBase<TInput, TFacts> {
	/** Validated, deeply readonly input supplied to the operation. */
	readonly input: Readonly<TInput>;
	/** Trusted server-derived facts used by the authorization rule. */
	readonly facts: Readonly<TFacts>;
	/** Authorized request identity, or `null` for anonymous and trusted calls. */
	readonly identity: Readonly<CMSOperationIdentity> | null;
	/** Transport request when the operation was invoked through HTTP or `forRequest()`. */
	readonly request?: Request;
	/** Compatibility view of the transport request headers. */
	readonly headers?: Headers;
	/** Compatibility alias for the authorized identity ID. */
	readonly userId?: string;
	/** Compatibility alias for the operation's CMS content-type slug. */
	readonly typeSlug?: string;
}

/** Authorized context supplied before a CMS record is created. */
export interface CMSCreateOperationContext
	extends CMSOperationContextBase<
		{
			readonly typeSlug: string;
			readonly body: {
				readonly slug: string;
				readonly data: Readonly<Record<string, CMSOperationData>>;
			};
		},
		{ contentType: string }
	> {
	/** Server-resolved content-type slug for the record being created. */
	readonly typeSlug: string;
	/** Validated create payload supplied to the operation. */
	readonly body: {
		/** Requested record slug before canonical slugification. */
		readonly slug: string;
		/** Validated JSON-safe request fields, including any inline `_new` relation values. */
		readonly data: Readonly<Record<string, CMSOperationData>>;
	};
}

/** CMS create context after execution. */
export interface CMSCreateResultContext extends CMSCreateOperationContext {
	/** Fully serialized record returned by the successful create operation. */
	readonly result: CMSDeepReadonly<SerializedContentItemWithType>;
}

/** Authorized context supplied before a CMS record is updated. */
export interface CMSUpdateOperationContext
	extends CMSOperationContextBase<
		{
			readonly typeSlug: string;
			readonly id: string;
			readonly body: {
				readonly slug?: string;
				readonly data?: Readonly<Record<string, CMSOperationData>>;
			};
		},
		{ contentType: string; recordId: string; authorId?: string }
	> {
	/** Server-resolved content-type slug for the record being updated. */
	readonly typeSlug: string;
	/** Canonical route parameters for the authorized record. */
	readonly params: { readonly typeSlug: string; readonly id: string };
	/** Validated partial update payload supplied to the operation. */
	readonly body: {
		/** Optional replacement slug before canonical slugification. */
		readonly slug?: string;
		/** Optional record-field fragment; hooks receive its merged validated result. */
		readonly data?: Readonly<Record<string, CMSOperationData>>;
	};
}

/** CMS update context after execution. */
export interface CMSUpdateResultContext extends CMSUpdateOperationContext {
	/** Fully serialized record returned by the successful update operation. */
	readonly result: CMSDeepReadonly<SerializedContentItemWithType>;
}

/** Authorized context supplied before a CMS record is deleted. */
export interface CMSDeleteOperationContext
	extends CMSOperationContextBase<
		{ readonly typeSlug: string; readonly id: string },
		{ contentType: string; recordId: string; authorId?: string }
	> {
	/** Server-resolved content-type slug for the record being deleted. */
	readonly typeSlug: string;
	/** Canonical route parameters for the authorized record. */
	readonly params: { readonly typeSlug: string; readonly id: string };
}

/** CMS delete context after execution. */
export interface CMSDeleteResultContext extends CMSDeleteOperationContext {
	/** Successful delete result. */
	readonly result: { readonly success: true };
}

interface CMSReadOperationContext
	extends CMSOperationContextBase<
		unknown,
		{
			contentType?: string;
			scope?: "collection" | "record";
			recordId?: string;
			authorId?: string;
		}
	> {}

/** Authorized context shared by the CMS operation lifecycle hooks. */
export type CMSOperationLifecycleContext =
	| CMSReadOperationContext
	| CMSCreateOperationContext
	| CMSUpdateOperationContext
	| CMSDeleteOperationContext;

/** Authorized lifecycle context supplied to the observational error hook. */
export type CMSOperationErrorContext = CMSOperationLifecycleContext & {
	/** Original post-authorization operation error observed by `onErrorExecuteContentOperation`. */
	readonly error: unknown;
};

/** Domain lifecycle hooks that run only after successful CMS authorization. */
export interface CMSBackendHooks {
	/** Runs with validated canonical record data after authorization and before any database write. */
	onBeforeCreateContent?: (
		data: Readonly<Record<string, CMSOperationData>>,
		context: CMSCreateOperationContext,
	) => Promise<void> | void;
	/** Observes the fully created record after the atomic create succeeds. */
	onAfterCreateContent?: (
		item: CMSDeepReadonly<SerializedContentItemWithType>,
		context: CMSCreateResultContext,
	) => Promise<void> | void;
	/** Runs for every update with the complete merged, validated record before any database write. */
	onBeforeUpdateContent?: (
		id: string,
		data: Readonly<Record<string, CMSOperationData>>,
		context: CMSUpdateOperationContext,
	) => Promise<void> | void;
	/** Observes the fully updated record after the atomic update succeeds. */
	onAfterUpdateContent?: (
		item: CMSDeepReadonly<SerializedContentItemWithType>,
		context: CMSUpdateResultContext,
	) => Promise<void> | void;
	/** Runs after authorization and before the record is deleted. */
	onBeforeDeleteContent?: (
		id: string,
		context: CMSDeleteOperationContext,
	) => Promise<void> | void;
	/** Observes the deleted record ID after the atomic delete succeeds. */
	onAfterDeleteContent?: (
		id: string,
		context: CMSDeleteResultContext,
	) => Promise<void> | void;
	/** Observes post-authorization failures without replacing the original error. */
	onErrorExecuteContentOperation?: (
		error: Error,
		operation: "create" | "update" | "delete" | "list" | "get",
		context: CMSOperationErrorContext,
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
	/**
	 * Maximum number of items that can be requested in a single page.
	 * Applied to all list endpoints (`/content/:typeSlug`, by-relation, and inverse-relation).
	 *
	 * Raise this when your content types have many items and you need to fetch
	 * large pages (e.g. for SSG, CSV export, or programmatic access).
	 *
	 * @default 1000
	 */
	maxPageSize?: number;
}
