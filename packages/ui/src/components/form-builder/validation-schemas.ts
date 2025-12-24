import { z } from "zod";

/**
 * Validation Schemas Registry
 *
 * This file defines type-safe validation schemas for the form-builder properties editor.
 * Based on the Zod serialization analysis, only serializable properties are included.
 *
 * Usage:
 *   propertiesSchema: baseMetaSchema
 *     .merge(VALIDATION_SCHEMAS[backingType])
 *     .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS[backingType] }))
 */

// ============================================================================
// BASE META SCHEMAS
// ============================================================================

/**
 * Base meta properties (universal - all field types)
 * Includes: label, description, required
 */
export const baseMetaSchema = z.object({
  label: z.string().min(1).meta({ label: "Label" }),
  description: z.string().optional().meta({ label: "Description" }),
  required: z
    .boolean()
    .default(false)
    .meta({ label: "Required", fieldType: "switch" }),
});

/**
 * Extended base with placeholder (for text-like fields only)
 * Use for: text, email, password, url, phone, textarea, number, select
 */
export const baseMetaSchemaWithPlaceholder = baseMetaSchema.merge(
  z.object({
    placeholder: z.string().optional().meta({ label: "Placeholder" }),
  })
);

// ============================================================================
// DEFAULT VALUE SCHEMAS
// ============================================================================

/**
 * Default value schemas - typed per backing Zod type
 * Serializes to JSON Schema as { "default": value }
 */
export const DEFAULT_VALUE_SCHEMAS = {
  string: z.string().optional().meta({ label: "Default Value" }),
  number: z.number().optional().meta({ label: "Default Value" }),
  boolean: z
    .boolean()
    .default(false)
    .meta({ label: "Default Value", fieldType: "switch" }),
  date: z.date().optional().meta({ label: "Default Date", fieldType: "date" }),
  enum: z
    .string()
    .optional()
    .meta({
      label: "Default Value",
      description: "Must match one of the options",
    }),
} as const;

// ============================================================================
// TYPE-SPECIFIC VALIDATION SCHEMAS
// ============================================================================

/**
 * String validation schema
 * Serializes to: minLength, maxLength, pattern
 */
export const stringValidationSchema = z.object({
  minLength: z
    .number()
    .int()
    .min(0)
    .optional()
    .meta({ label: "Min Length" }),
  maxLength: z
    .number()
    .int()
    .min(1)
    .optional()
    .meta({ label: "Max Length" }),
  // Note: pattern/regex is serializable but requires careful UX for input
  // Uncomment to enable:
  // pattern: z.string().optional().meta({ label: "Pattern (Regex)" }),
});

/**
 * Number validation schema
 * Serializes to: minimum, maximum, multipleOf
 */
export const numberValidationSchema = z.object({
  min: z.number().optional().meta({ label: "Minimum" }),
  max: z.number().optional().meta({ label: "Maximum" }),
  // Note: multipleOf is serializable but less commonly used
  // Uncomment to enable:
  // multipleOf: z.number().optional().meta({ label: "Multiple Of" }),
});

/**
 * Boolean validation schema
 * No additional validation constraints - booleans are just true/false
 */
export const booleanValidationSchema = z.object({});

/**
 * Date validation schema
 * Serializes to: formatMinimum, formatMaximum (with date-time override)
 * Note: Currently date min/max requires custom handling in toJSONSchema
 */
export const dateValidationSchema = z.object({
  // Date min/max can be added when the date serialization is refined
  // minDate: z.date().optional().meta({ label: "Minimum Date", fieldType: "date" }),
  // maxDate: z.date().optional().meta({ label: "Maximum Date", fieldType: "date" }),
});

/**
 * Enum options schema (for select and radio)
 * The options textarea - user enters one option per line
 */
export const enumOptionsSchema = z.object({
  options: z.string().meta({
    label: "Options (one per line)",
    fieldType: "textarea",
    description: "Enter each option on a new line",
  }),
});

/**
 * Object validation schema
 * Object fields don't have their own validation - validation comes from children
 */
export const objectValidationSchema = z.object({});

/**
 * Array validation schema
 * Serializes to: minItems, maxItems
 */
export const arrayValidationSchema = z.object({
  minItems: z
    .number()
    .int()
    .min(0)
    .optional()
    .meta({ label: "Min Items" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .optional()
    .meta({ label: "Max Items" }),
});

// ============================================================================
// VALIDATION SCHEMAS REGISTRY
// ============================================================================

/**
 * Registry mapping backing Zod type to validation schema
 * Only includes properties confirmed serializable by the analysis script
 */
export const VALIDATION_SCHEMAS = {
  string: stringValidationSchema,
  number: numberValidationSchema,
  boolean: booleanValidationSchema,
  date: dateValidationSchema,
  enum: enumOptionsSchema,
  object: objectValidationSchema,
  array: arrayValidationSchema,
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Note: The composePropertiesSchema helper was removed due to complex TypeScript 
// inference issues with Zod's merge types. Instead, compose schemas directly:
//
// Example usage:
//   baseMetaSchemaWithPlaceholder
//     .merge(stringValidationSchema)
//     .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string }))

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type BackingZodType = keyof typeof VALIDATION_SCHEMAS;
export type BaseMetaSchemaType = z.infer<typeof baseMetaSchema>;
export type BaseMetaSchemaWithPlaceholderType = z.infer<
  typeof baseMetaSchemaWithPlaceholder
>;
