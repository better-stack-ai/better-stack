/**
 * CMS Content Type Schemas
 *
 * This file defines the Zod schemas for CMS content types.
 * Import these schemas in both:
 * - Server-side: better-stack.ts for backend validation
 * - Client-side: components for type-safe hooks
 */
import { z } from "zod"

// ========== Product Schema ==========
export const ProductSchema = z.object({
    name: z.string().min(1).meta({ 
        description: "Product display name",
        placeholder: "Enter product name..." 
    }),
    description: z.string().meta({ 
        description: "Full product description",
        placeholder: "Describe this product...",
        fieldType: "textarea",
    }),
    price: z.coerce.number().min(0).meta({ placeholder: "0.00" }),
    image: z.string().optional().meta({
        description: "Product image URL",
        fieldType: "file",
    }),
    featured: z.boolean().default(false).meta({ 
        description: "Show on homepage featured section" 
    }),
    category: z.enum(["Electronics", "Clothing", "Home", "Sports"]),
})

// ========== Testimonial Schema ==========
export const TestimonialSchema = z.object({
    author: z.string().min(1).meta({ placeholder: "Customer name" }),
    company: z.string().optional().meta({ placeholder: "Company name (optional)" }),
    quote: z.string().meta({ 
        description: "Customer testimonial text",
        placeholder: "What did they say about us?",
        fieldType: "textarea",
    }),
    rating: z.coerce.number().min(1).max(5).meta({ 
        description: "Rating out of 5 stars" 
    }),
})

// ========== Category Schema (for directory relationships) ==========
export const CategorySchema = z.object({
    name: z.string().min(1).meta({
        description: "Category name",
        placeholder: "Enter category name...",
    }),
    description: z.string().optional().meta({
        description: "Optional category description",
        placeholder: "Describe this category...",
        fieldType: "textarea",
    }),
    color: z.string().optional().meta({
        description: "Category color (hex code)",
        placeholder: "#3b82f6",
    }),
})

// ========== Resource Schema (directory listing with relations) ==========
export const ResourceSchema = z.object({
    name: z.string().min(1).meta({
        description: "Resource name",
        placeholder: "Enter resource name...",
    }),
    description: z.string().meta({
        description: "Full resource description",
        placeholder: "Describe this resource...",
        fieldType: "textarea",
    }),
    website: z.string().url().optional().meta({
        description: "Website URL",
        placeholder: "https://example.com",
    }),
    logo: z.string().optional().meta({
        description: "Resource logo",
        fieldType: "file",
    }),
    // Relation field - manyToMany with categories
    categoryIds: z.array(
        z.object({ id: z.string() })
    ).default([]).meta({
        fieldType: "relation",
        relation: {
            type: "manyToMany",
            targetType: "category",
            displayField: "name",
            creatable: true,
        },
    }),
})

// ========== Comment Schema (one-to-many: Comment belongs to Resource) ==========
export const CommentSchema = z.object({
    author: z.string().min(1).meta({
        description: "Comment author name",
        placeholder: "Your name...",
    }),
    content: z.string().min(1).meta({
        description: "Comment content",
        placeholder: "Write your comment...",
        fieldType: "textarea",
    }),
    // belongsTo relation - links to a single Resource
    // Unlike manyToMany (array), belongsTo stores a single { id: string } reference
    resourceId: z.object({ id: z.string() }).optional().meta({
        fieldType: "relation",
        relation: {
            type: "belongsTo",
            targetType: "resource",
            displayField: "name",
        },
    }),
})

// ========== Type Exports ==========

/** Inferred type for Product data */
export type ProductData = z.infer<typeof ProductSchema>

/** Inferred type for Testimonial data */
export type TestimonialData = z.infer<typeof TestimonialSchema>

/** Inferred type for Category data */
export type CategoryData = z.infer<typeof CategorySchema>

/** Inferred type for Resource data */
export type ResourceData = z.infer<typeof ResourceSchema>

/** Inferred type for Comment data */
export type CommentData = z.infer<typeof CommentSchema>

/**
 * Type map for all CMS content types.
 * Use this with CMS hooks for type-safe parsedData.
 *
 * @example
 * ```typescript
 * import { CMSTypes } from "@/lib/cms-schemas"
 * import { useContent } from "@btst/stack/plugins/cms/client/hooks"
 *
 * // Type-safe products
 * const { items } = useContent<CMSTypes, "product">("product")
 * items[0].parsedData.name // string
 * items[0].parsedData.price // number
 *
 * // Type-safe resources with relations
 * const { items } = useContent<CMSTypes, "resource">("resource")
 * items[0].parsedData.categoryIds // array of relation values
 *
 * // Type-safe comments with belongsTo relation
 * const { items } = useContent<CMSTypes, "comment">("comment")
 * items[0].parsedData.resourceId // { id: string } | undefined
 * ```
 */
export type CMSTypes = {
    product: ProductData
    testimonial: TestimonialData
    category: CategoryData
    resource: ResourceData
    comment: CommentData
}
