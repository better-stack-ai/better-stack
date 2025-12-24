/**
 * Unified Schema Converter Module
 * 
 * Provides consistent bidirectional conversion between Zod schemas and JSON Schema,
 * handling all edge cases in one place:
 * 
 * 1. Date handling: z.date() ↔ { type: "string", format: "date-time" }
 * 2. Steps metadata: Preserves multi-step form configuration
 * 3. Step group mapping: Tracks which fields belong to which step
 * 4. Date constraints: Preserves min/max date validations
 * 
 * Usage:
 * ```ts
 * // Zod → JSON Schema (for storage/transport)
 * const jsonSchema = zodToFormSchema(myZodSchema);
 * 
 * // JSON Schema → Zod (for validation)
 * const zodSchema = formSchemaToZod(jsonSchema);
 * ```
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

// ============================================================================
// TYPES
// ============================================================================

export interface FormStep {
  id: string;
  title: string;
}

export interface FormSchemaMetadata {
  /** Multi-step form step definitions */
  steps?: FormStep[];
  /** Map of field names to their step indices */
  stepGroupMap?: Record<string, number>;
}

interface JsonSchemaProperty {
  type?: string;
  format?: string;
  formatMinimum?: string;
  formatMaximum?: string;
  stepGroup?: number;
  properties?: Record<string, JsonSchemaProperty>;
  [key: string]: unknown;
}

interface FormJsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  steps?: FormStep[];
  stepGroupMap?: Record<string, number>;
  [key: string]: unknown;
}

// ============================================================================
// ZOD → JSON SCHEMA (for storage/transport)
// ============================================================================

/**
 * Convert a Zod schema to JSON Schema with proper handling for:
 * - z.date() → { type: "string", format: "date-time" }
 * - Date min/max constraints → formatMinimum/formatMaximum
 * - Steps metadata (if provided via schema.meta() or explicit metadata param)
 * 
 * @param schema - The Zod schema to convert
 * @param metadata - Optional explicit metadata to include (overrides schema meta)
 */
export function zodToFormSchema<T extends z.ZodType>(
  schema: T,
  metadata?: FormSchemaMetadata
): FormJsonSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    unrepresentable: "any",
    override: (ctx) => {
      const def = (ctx.zodSchema as any)?._zod?.def;
      if (def?.type === "date") {
        ctx.jsonSchema.type = "string";
        ctx.jsonSchema.format = "date-time";
        
        // Preserve min/max date constraints
        // In Zod v4, these are available as minDate/maxDate on the schema object
        const zodSchema = ctx.zodSchema as any;
        if (zodSchema.minDate) {
          ctx.jsonSchema.formatMinimum = zodSchema.minDate;
        }
        if (zodSchema.maxDate) {
          ctx.jsonSchema.formatMaximum = zodSchema.maxDate;
        }
      }
    },
  }) as FormJsonSchema;
  
  // If explicit metadata is provided, use it
  if (metadata?.steps) {
    jsonSchema.steps = metadata.steps;
  }
  if (metadata?.stepGroupMap) {
    jsonSchema.stepGroupMap = metadata.stepGroupMap;
  }
  
  return jsonSchema;
}

// ============================================================================
// JSON SCHEMA → ZOD (for validation)
// ============================================================================

/**
 * Extract step group map from JSON Schema properties.
 * Looks for stepGroup property on each field.
 */
function extractStepGroupMap(jsonSchema: FormJsonSchema): Record<string, number> {
  const stepGroupMap: Record<string, number> = {};
  const properties = jsonSchema.properties;
  
  if (!properties) return stepGroupMap;
  
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (typeof fieldSchema.stepGroup === "number") {
      stepGroupMap[fieldName] = fieldSchema.stepGroup;
    }
  }
  
  return stepGroupMap;
}

/**
 * Find date fields with min/max constraints that need validation.
 */
function findDateFieldsWithConstraints(
  jsonSchema: FormJsonSchema
): Record<string, { min?: string; max?: string }> {
  const dateFields: Record<string, { min?: string; max?: string }> = {};
  const properties = jsonSchema.properties;
  
  if (!properties) return dateFields;
  
  for (const [key, prop] of Object.entries(properties)) {
    if (prop.type === "string" && prop.format === "date-time") {
      if (prop.formatMinimum || prop.formatMaximum) {
        dateFields[key] = {
          min: prop.formatMinimum,
          max: prop.formatMaximum,
        };
      }
    }
  }
  
  return dateFields;
}

/**
 * Add date constraint validations to a schema via superRefine.
 */
function addDateValidations(
  schema: z.ZodType,
  dateFieldsWithConstraints: Record<string, { min?: string; max?: string }>
): z.ZodType {
  if (Object.keys(dateFieldsWithConstraints).length === 0) {
    return schema;
  }
  
  return schema.superRefine((data: any, ctx) => {
    for (const [key, constraints] of Object.entries(dateFieldsWithConstraints)) {
      const value = data[key];
      if (value === undefined || value === null || value === "") continue;
      
      const dateValue = new Date(value);
      if (isNaN(dateValue.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid date",
          path: [key],
        });
        continue;
      }
      
      if (constraints.min) {
        const minDate = new Date(constraints.min);
        if (dateValue < minDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Date must be after ${minDate.toLocaleDateString()}`,
            path: [key],
          });
        }
      }
      
      if (constraints.max) {
        const maxDate = new Date(constraints.max);
        if (dateValue > maxDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Date must be before ${maxDate.toLocaleDateString()}`,
            path: [key],
          });
        }
      }
    }
  });
}

/**
 * Re-attach steps metadata to a Zod schema via .meta().
 * This is necessary because z.fromJSONSchema() doesn't preserve custom properties.
 */
function attachStepsMetadata(
  schema: z.ZodType,
  jsonSchema: FormJsonSchema
): z.ZodType {
  const steps = jsonSchema.steps;
  if (!steps || steps.length === 0) {
    return schema;
  }
  
  // Get stepGroupMap from either root level or extract from properties
  const stepGroupMap = jsonSchema.stepGroupMap ?? extractStepGroupMap(jsonSchema);
  
  return schema.meta({
    steps,
    stepGroupMap,
  });
}

/**
 * Convert JSON Schema to Zod schema with proper handling for:
 * - { type: "string", format: "date-time" } → date field (with constraints)
 * - Steps metadata re-attachment (preserved via .meta())
 * - Step group mapping
 * 
 * @param jsonSchema - The JSON Schema to convert
 * @returns A Zod schema ready for validation, with all metadata preserved
 */
export function formSchemaToZod(jsonSchema: FormJsonSchema): z.ZodType {
  // 1. Create base schema from JSON Schema
  let schema = z.fromJSONSchema(jsonSchema as z.core.JSONSchema.JSONSchema);
  
  // 2. Add date constraint validations
  const dateFieldsWithConstraints = findDateFieldsWithConstraints(jsonSchema);
  schema = addDateValidations(schema, dateFieldsWithConstraints);
  
  // 3. Re-attach steps metadata so SteppedAutoForm can extract it
  schema = attachStepsMetadata(schema, jsonSchema);
  
  return schema;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a JSON Schema has multi-step configuration.
 */
export function hasSteps(jsonSchema: FormJsonSchema): boolean {
  return Array.isArray(jsonSchema.steps) && jsonSchema.steps.length > 0;
}

/**
 * Get steps from a JSON Schema.
 */
export function getSteps(jsonSchema: FormJsonSchema): FormStep[] {
  return jsonSchema.steps ?? [];
}

/**
 * Get the step group map from a JSON Schema.
 * Returns a map of field names to step indices.
 */
export function getStepGroupMap(jsonSchema: FormJsonSchema): Record<string, number> {
  return jsonSchema.stepGroupMap ?? extractStepGroupMap(jsonSchema);
}

