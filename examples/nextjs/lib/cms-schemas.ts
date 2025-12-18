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
        placeholder: "Describe this product..." 
    }),
    price: z.coerce.number().min(0).meta({ placeholder: "0.00" }),
    image: z.string().optional().meta({
        description: "Product image URL"
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
        placeholder: "What did they say about us?" 
    }),
    rating: z.coerce.number().min(1).max(5).meta({ 
        description: "Rating out of 5 stars" 
    }),
})

// ========== Type Exports ==========

/** Inferred type for Product data */
export type ProductData = z.infer<typeof ProductSchema>

/** Inferred type for Testimonial data */
export type TestimonialData = z.infer<typeof TestimonialSchema>

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
 * // Type-safe testimonials
 * const { items } = useContent<CMSTypes, "testimonial">("testimonial")
 * items[0].parsedData.author // string
 * items[0].parsedData.quote // string
 * ```
 */
export type CMSTypes = {
    product: ProductData
    testimonial: TestimonialData
}
