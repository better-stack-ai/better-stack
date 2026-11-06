import { z } from "zod";
import { matchesShowIf, type ShowIfCondition } from "@workspace/ui/lib/form-visibility";
export type { ShowIfCondition } from "@workspace/ui/lib/form-visibility";

const displaySchemas = new WeakMap<z.ZodType, z.ZodObject<z.ZodRawShape>>();

/** Recover the original field shape for a conditional form validator. */
export function getFormDisplaySchema(schema: z.ZodType) {
  const cached = displaySchemas.get(schema);
  if (cached) return cached;
  const metadata = schema.meta();
  if (schema instanceof z.ZodPipe && metadata?.properties) {
    const display = z.fromJSONSchema(metadata as z.core.JSONSchema.JSONSchema) as z.ZodObject<z.ZodRawShape>;
    displaySchemas.set(schema, display);
    return display;
  }
  return undefined;
}

// ============================================================================
// TYPES
// ============================================================================

export interface FormStep {
  id: string;
  title: string;
  /** Display this step only when its condition matches. */
  showIf?: ShowIfCondition;
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
  showIf?: ShowIfCondition;
  items?: JsonSchemaProperty;
  required?: string[];
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

/** Whether any field, nested container, or step has a visibility rule. */
function hasVisibilityRules(schema: FormJsonSchema): boolean {
  return Boolean(schema.steps?.some(step => step.showIf) || Object.values(schema.properties ?? {}).some(prop =>
    prop.showIf || (prop.properties && hasVisibilityRules(prop)) || (prop.items && hasVisibilityRules(prop.items))));
}

/** Resolve a form's visible schema and strip stale hidden values together. */
export function resolveVisibleSchema(schema: FormJsonSchema, values: Record<string, unknown>): { schema: FormJsonSchema; data: Record<string, unknown> } {
  const data = { ...values };
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (data[key] === undefined && prop.default !== undefined) Object.defineProperty(data, key, { value: prop.default, enumerable: true, writable: true, configurable: true });
  }
  const comparisonValues = { ...data };
  const visibility = new Map<string, boolean>();
  const resolving: string[] = [];
  const isVisible = (key: string): boolean => {
    if (visibility.has(key)) return visibility.get(key)!;
    const cycleStart = resolving.indexOf(key);
    if (cycleStart !== -1) {
      // Cyclic conditions cannot establish visibility from hidden answers.
      for (const field of resolving.slice(cycleStart)) visibility.set(field, false);
      return false;
    }
    const prop = schema.properties?.[key];
    if (!prop) return true;
    resolving.push(key);
    const matches = (condition: ShowIfCondition | undefined) => {
      if (!condition) return true;
      const sourceVisible = isVisible(condition.field);
      return matchesShowIf(condition, { [condition.field]: sourceVisible && Object.hasOwn(comparisonValues, condition.field) ? comparisonValues[condition.field] : undefined });
    };
    const step = schema.steps?.[prop.stepGroup ?? schema.stepGroupMap?.[key] ?? 0];
    const result = matches(step?.showIf) && matches(prop.showIf);
    resolving.pop();
    if (!visibility.has(key)) visibility.set(key, result);
    return visibility.get(key)!;
  };
  const properties: Record<string, JsonSchemaProperty> = Object.create(null);
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (!isVisible(key)) {
      Reflect.deleteProperty(data, key);
      continue;
    }
    const { showIf: _showIf, ...visibleProp } = prop;
    if (prop.properties && data[key] && typeof data[key] === "object" && !Array.isArray(data[key])) {
      const nested = resolveVisibleSchema(prop, data[key] as Record<string, unknown>);
      Object.assign(visibleProp, nested.schema);
      data[key] = nested.data;
    }
    properties[key] = visibleProp;
  }
  return { schema: { ...schema, properties, required: schema.required?.filter(key => key in properties), steps: schema.steps?.map(({ showIf: _showIf, ...step }) => step) }, data };
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
  if (jsonSchema.default !== undefined && hasVisibilityRules(jsonSchema)) {
    const { default: defaultValue, ...contentSchema } = jsonSchema;
    return formSchemaToZod(contentSchema).prefault(defaultValue).meta({ ...jsonSchema });
  }
  if (jsonSchema.steps?.some(step => step.showIf) || Object.values(jsonSchema.properties ?? {}).some(prop => prop.showIf)) {
    // The input object retains the original shape for AutoForm introspection.
    // Validation happens against the visible schema, before the output is persisted.
    const display = z.fromJSONSchema(jsonSchema as z.core.JSONSchema.JSONSchema) as z.ZodObject<z.ZodRawShape>;
    const shape = Object.fromEntries(Object.entries(display.shape).map(([key]) => [key, z.unknown().optional()]));
    const conditional = z.object(shape).passthrough().transform((data, ctx) => {
      const { schema: visibleSchema, data: visibleData } = resolveVisibleSchema(jsonSchema, data);
      const result = formSchemaToZod(visibleSchema).safeParse(visibleData);
      if (!result.success) {
        for (const issue of result.error.issues) ctx.addIssue({ ...issue });
        return z.NEVER;
      }
      return result.data;
    }).meta({ ...jsonSchema });
    displaySchemas.set(conditional, display);
    return conditional;
  }

  // 1. Create base schema from JSON Schema
  let schema = z.fromJSONSchema(jsonSchema as z.core.JSONSchema.JSONSchema);

  if (schema instanceof z.ZodObject) {
    const nestedShape: Record<string, z.ZodType> = {};
    for (const [key, prop] of Object.entries(jsonSchema.properties ?? {})) {
      if (!hasVisibilityRules({ properties: { [key]: prop } })) continue;
      let nested: z.ZodType | undefined;
      if (prop.type === "object" && prop.properties) nested = formSchemaToZod(prop);
      if (prop.type === "array" && prop.items?.properties) {
        let array = z.array(formSchemaToZod(prop.items));
        if (typeof prop.minItems === "number") array = array.min(prop.minItems);
        if (typeof prop.maxItems === "number") array = array.max(prop.maxItems);
        nested = array;
      }
      if (nested) {
        if (!jsonSchema.required?.includes(key)) nested = nested.optional();
        nestedShape[key] = prop.default !== undefined ? nested.prefault(prop.default) : nested;
      }
    }
    if (Object.keys(nestedShape).length) schema = schema.extend(nestedShape);
  }

  // 2. z.fromJSONSchema creates strict ZodObjects that reject unknown keys with
  //    an 'unrecognized_keys' error. This breaks form save when parsedData
  //    contains fields added to the Zod schema after the content type was last
  //    synced to the DB. Apply passthrough() so unknown keys are preserved
  //    rather than rejected. We deliberately do NOT use strip() here: stripping
  //    would silently drop values for fields that exist in the live Zod schema
  //    but not yet in the stale stored JSON schema, losing data on save.
  if (schema && typeof (schema as z.ZodObject<z.ZodRawShape>).passthrough === "function") {
    schema = (schema as z.ZodObject<z.ZodRawShape>).passthrough();
  }
  
  // 3. Add date constraint validations
  const dateFieldsWithConstraints = findDateFieldsWithConstraints(jsonSchema);
  schema = addDateValidations(schema, dateFieldsWithConstraints);
  
  // 4. Re-attach steps metadata so SteppedAutoForm can extract it
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

