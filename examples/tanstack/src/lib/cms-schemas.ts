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
    description: z.string().meta({ placeholder: "Describe this product..." }),
    price: z.coerce.number().min(0).meta({ placeholder: "0.00" }),
    image: z.string().optional().meta({
        description: "Product image URL"
    }),
    featured: z.boolean().default(false),
    category: z.enum(["Electronics", "Clothing", "Home", "Sports"]),
})

// ========== Testimonial Schema ==========
export const TestimonialSchema = z.object({
    author: z.string().min(1).meta({ placeholder: "Customer name" }),
    company: z.string().optional().meta({ placeholder: "Company name (optional)" }),
    quote: z.string().meta({ placeholder: "What did they say about us?" }),
    rating: z.coerce.number().min(1).max(5),
})

// ========== Type Exports ==========

/** Inferred type for Product data */
export type ProductData = z.infer<typeof ProductSchema>

/** Inferred type for Testimonial data */
export type TestimonialData = z.infer<typeof TestimonialSchema>

/**
 * Type map for all CMS content types.
 * Use this with CMS hooks for type-safe parsedData.
 */
export type CMSTypes = {
    product: ProductData
    testimonial: TestimonialData
}
