import React from "react";
import type { DefaultValues } from "react-hook-form";
import { z } from "zod";
import type { FieldConfig } from "./types";

/**
 * Get the type name from a Zod v4 schema's _zod.def.
 * In Zod v4: _zod.def.type (e.g., "default", "optional", "object", "string")
 */
function getDefTypeName(schema: z.ZodType): string {
  // Access through _zod.def.type for Zod v4
  const def = (schema as any)._zod?.def;
  return def?.type || "";
}

/**
 * Check if a schema definition matches a type name (Zod v4 only).
 * @param schema - The Zod schema
 * @param typeName - Zod v4 style name (e.g., "default", "optional", "object")
 */
function isDefType(schema: z.ZodType, typeName: string): boolean {
  return getDefTypeName(schema) === typeName;
}

/**
 * Type for wrapped object schemas in Zod v4.
 * In Zod v4, ZodEffects is replaced with ZodPipe for transforms.
 * For autoform purposes, we mainly deal with objects that might be wrapped in optional/default/nullable.
 */
export type ZodObjectOrWrapped = z.ZodObject<any, any> | z.ZodType<any>;

/**
 * Beautify a camelCase string.
 * e.g. "myString" -> "My String"
 */
export function beautifyObjectName(string: string) {
  // if numbers only return the string
  let output = string.replace(/([A-Z])/g, " $1");
  output = output.charAt(0).toUpperCase() + output.slice(1);
  return output;
}

/**
 * Get the lowest level Zod type.
 * This will unpack optionals, defaults, nullables, pipes, etc.
 */
export function getBaseSchema<ChildType extends z.ZodType = z.ZodType>(
  schema: ChildType
): ChildType | null {
  if (!schema) return null;

  const def = (schema as any)._zod?.def;
  if (!def) return schema as ChildType;

  // Handle wrapped types by checking for innerType or wrapped property
  if (def.innerType) {
    return getBaseSchema(def.innerType as ChildType);
  }

  // Handle ZodPipe (transforms) - get the output schema
  if (def.out) {
    return getBaseSchema(def.out as ChildType);
  }

  // Handle schema property (for some wrapper types)
  if (def.schema) {
    return getBaseSchema(def.schema as ChildType);
  }

  return schema as ChildType;
}

/**
 * Get the type name of the lowest level Zod type.
 * This will unpack optionals, defaults, etc.
 * 
 * Returns Zod v4 style type names (e.g., "enum", "boolean", "object")
 */
export function getBaseType(schema: z.ZodType): string {
  const baseSchema = getBaseSchema(schema);
  if (!baseSchema) return "";

  const typeName = getDefTypeName(baseSchema);
  
  // Map to consistent type names (capitalize first letter for component lookup)
  const typeMap: Record<string, string> = {
    object: "ZodObject",
    array: "ZodArray",
    string: "ZodString",
    number: "ZodNumber",
    int: "ZodNumber",
    float: "ZodNumber",
    boolean: "ZodBoolean",
    date: "ZodDate",
    enum: "ZodEnum",
    nativeEnum: "ZodNativeEnum",
    literal: "ZodLiteral",
    union: "ZodUnion",
  };

  return typeMap[typeName] || typeName;
}

/**
 * Search for a "default" wrapper in the Zod stack and return its value.
 * In Zod v4: _zod.def.defaultValue is the default value (not a function)
 */
export function getDefaultValueInZodStack(schema: z.ZodType): any {
  const def = (schema as any)._zod?.def;
  if (!def) return undefined;

  if (def.type === "default") {
    // In Zod v4, defaultValue is the value directly (not a function)
    const defaultValue = def.defaultValue;
    // Handle both function (legacy) and value
    if (typeof defaultValue === "function") {
      return defaultValue();
    }
    return defaultValue;
  }

  // Check wrapped types
  if (def.innerType) {
    return getDefaultValueInZodStack(def.innerType);
  }
  if (def.schema) {
    return getDefaultValueInZodStack(def.schema);
  }

  return undefined;
}

/**
 * Get all default values from a Zod schema.
 */
export function getDefaultValues<Schema extends z.ZodObject<any, any>>(
  schema: Schema,
  fieldConfig?: FieldConfig<z.infer<Schema>>
) {
  if (!schema) return null;
  const { shape } = schema;
  type DefaultValuesType = DefaultValues<Partial<z.infer<Schema>>>;
  const defaultValues = {} as DefaultValuesType;
  if (!shape) return defaultValues;

  for (const key of Object.keys(shape)) {
    const item = shape[key] as z.ZodType;

    if (getBaseType(item) === "ZodObject") {
      const defaultItems = getDefaultValues(
        getBaseSchema(item) as unknown as z.ZodObject<any, any>,
        fieldConfig?.[key] as FieldConfig<z.infer<Schema>>
      );

      if (defaultItems !== null) {
        for (const defaultItemKey of Object.keys(defaultItems)) {
          const pathKey = `${key}.${defaultItemKey}` as keyof DefaultValuesType;
          (defaultValues as any)[pathKey] = defaultItems[defaultItemKey];
        }
      }
    } else {
      let defaultValue = getDefaultValueInZodStack(item);
      if (
        (defaultValue === null || defaultValue === "") &&
        fieldConfig?.[key]?.inputProps
      ) {
        defaultValue = (fieldConfig?.[key]?.inputProps as unknown as any)
          .defaultValue;
      }
      if (defaultValue !== undefined) {
        (defaultValues as any)[key as keyof DefaultValuesType] = defaultValue;
      }
    }
  }

  return defaultValues;
}

/**
 * Extract the object schema from a potentially wrapped schema.
 * Handles pipes, defaults, optionals, etc.
 */
export function getObjectFormSchema(
  schema: ZodObjectOrWrapped
): z.ZodObject<any, any> {
  if (!schema) return schema as z.ZodObject<any, any>;

  const def = (schema as any)._zod?.def;
  if (!def) return schema as z.ZodObject<any, any>;

  // If it's a pipe (transform), get the input schema
  if (def.type === "pipe") {
    return getObjectFormSchema(def.in);
  }

  // Handle wrapped types
  if (def.innerType) {
    return getObjectFormSchema(def.innerType);
  }
  if (def.schema) {
    return getObjectFormSchema(def.schema);
  }

  return schema as z.ZodObject<any, any>;
}

/**
 * Get description from a Zod schema.
 * In Zod v4, descriptions are stored in the global registry.
 */
export function getSchemaDescription(schema: z.ZodType): string | undefined {
  // Try to get from registry first (Zod v4)
  const registered = z.globalRegistry.get(schema);
  if (registered?.description) {
    return registered.description;
  }

  // Fallback: check if description is on the schema itself
  const def = (schema as any)._zod?.def;
  return def?.description;
}

/**
 * Convert a Zod schema to HTML input props to give direct feedback to the user.
 * Once submitted, the schema will be validated completely.
 */
export function zodToHtmlInputProps(
  schema: z.ZodType
): React.InputHTMLAttributes<HTMLInputElement> {
  const def = (schema as any)._zod?.def;
  const defType = def?.type || "";

  // Check for optional/nullable
  if (["optional", "nullable"].includes(defType)) {
    return {
      ...zodToHtmlInputProps(def.innerType),
      required: false,
    };
  }

  // Check for default - fields with defaults should not be required
  // since the default value will be used if not provided
  if (defType === "default") {
    return {
      ...zodToHtmlInputProps(def.innerType),
      required: false,
    };
  }

  const inputProps: React.InputHTMLAttributes<HTMLInputElement> = {
    required: true,
  };

  // Get checks from the schema
  const checks = def?.checks;
  if (!checks || !Array.isArray(checks)) {
    return inputProps;
  }

  const type = getBaseType(schema);

  for (const check of checks) {
    // In Zod v4, checks have 'kind' property
    const checkKind = check.kind || check.type;
    
    if (checkKind === "min" || checkKind === "min_length") {
      if (type === "ZodString") {
        inputProps.minLength = check.value ?? check.minimum;
      } else {
        inputProps.min = check.value ?? check.minimum;
      }
    }
    if (checkKind === "max" || checkKind === "max_length") {
      if (type === "ZodString") {
        inputProps.maxLength = check.value ?? check.maximum;
      } else {
        inputProps.max = check.value ?? check.maximum;
      }
    }
  }

  return inputProps;
}

/**
 * Sort the fields by order.
 * If no order is set, the field will be sorted based on the order in the schema.
 */
export function sortFieldsByOrder<SchemaType extends z.ZodObject<any, any>>(
  fieldConfig: FieldConfig<z.infer<SchemaType>> | undefined,
  keys: string[]
) {
  const sortedFields = keys.sort((a, b) => {
    const fieldA: number = (fieldConfig?.[a]?.order as number) ?? 0;
    const fieldB = (fieldConfig?.[b]?.order as number) ?? 0;
    return fieldA - fieldB;
  });

  return sortedFields;
}
