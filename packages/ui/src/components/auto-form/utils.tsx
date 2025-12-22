import React from "react";
import type { DefaultValues } from "react-hook-form";
import { z } from "zod";
import type { AutoFormInputComponentProps, FieldConfig } from "./types";

/**
 * Convert a Zod schema to JSON Schema with proper date handling.
 * 
 * z.date() is not representable in JSON Schema by default.
 * This helper uses the `override` option to convert z.date() fields
 * to { type: "string", format: "date-time" } which is the standard
 * JSON Schema representation for dates.
 * 
 * This approach is simpler than codecs for form use cases because:
 * - Forms work directly with JavaScript Date objects
 * - z.date() validates Date objects correctly
 * - JSON Schema just needs a string representation for storage/transport
 * 
 * Min/max date constraints are preserved as formatMinimum/formatMaximum
 * in the JSON Schema output (JSON Schema draft 7+ format validation).
 */
export function toJSONSchemaWithDates<T extends z.ZodType>(schema: T) {
  return z.toJSONSchema(schema, {
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
          // Store as ISO string for JSON Schema format validation
          ctx.jsonSchema.formatMinimum = zodSchema.minDate;
        }
        if (zodSchema.maxDate) {
          ctx.jsonSchema.formatMaximum = zodSchema.maxDate;
        }
      }
    },
  });
}

export const BUILTIN_FIELD_TYPES = [
	"checkbox",
	"date",
	"select",
	"radio",
	"switch",
	"textarea",
	"number",
	"fallback",
] as const;

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
      // Also check fieldConfig for default values (important for JSON schema derived forms)
      if (
        (defaultValue === undefined || defaultValue === null || defaultValue === "") &&
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

// Import shared JSON Schema property type for consistency with form-builder
import type { JSONSchemaPropertyBase } from "../shared-form-types";

/**
 * JSON schema property shape that includes FieldConfigItem-compatible metadata.
 * Uses the shared type for consistency between form-builder and auto-form.
 */
type JsonSchemaProperty = JSONSchemaPropertyBase;

/**
 * Create a Zod schema from JSON Schema with proper date handling.
 * 
 * This is the counterpart to toJSONSchemaWithDates. It:
 * 1. Uses z.fromJSONSchema to create the base schema
 * 2. Wraps date fields with validation for formatMinimum/formatMaximum
 * 3. Keeps dates as strings (ISO format) for JSON compatibility
 * 
 * The date field component handles converting strings to Date objects for display.
 */
export function fromJSONSchemaWithDates(jsonSchema: Record<string, unknown>): z.ZodType {
	const baseSchema = z.fromJSONSchema(jsonSchema);
	const properties = jsonSchema.properties as Record<string, JsonSchemaProperty> | undefined;
	
	if (!properties) return baseSchema;
	
	// Find date fields that need validation
	const dateFieldsWithConstraints: Record<string, { min?: string; max?: string }> = {};
	
	for (const [key, prop] of Object.entries(properties)) {
		if (prop.type === "string" && prop.format === "date-time") {
			if (prop.formatMinimum || prop.formatMaximum) {
				dateFieldsWithConstraints[key] = {
					min: prop.formatMinimum,
					max: prop.formatMaximum,
				};
			}
		}
	}
	
	// If no date constraints, return base schema
	if (Object.keys(dateFieldsWithConstraints).length === 0) {
		return baseSchema;
	}
	
	// Add refinements for date validation
	return baseSchema.superRefine((data: any, ctx) => {
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

export function buildFieldConfigFromJsonSchema(
	jsonSchema: Record<string, unknown>,
	fieldComponents?: Record<
		string,
		React.ComponentType<AutoFormInputComponentProps>
	>,
): FieldConfig<Record<string, unknown>> {
	const fieldConfig: FieldConfig<Record<string, unknown>> = {};
	const properties = jsonSchema.properties as Record<string, JsonSchemaProperty>;

	if (!properties) return fieldConfig;

	for (const [key, value] of Object.entries(properties)) {
		const config: Record<string, unknown> = {};

		// Extract label from meta (support both 'label' and JSON Schema 'title')
		if (value.label) {
			config.label = value.label;
		} else if (value.title) {
			config.label = value.title;
		}

		// Extract description from meta
		if (value.description) {
			config.description = value.description;
		}

		// Extract inputProps from meta (includes placeholder, type, etc.)
		// Also merge in default value if present
		const inputProps: Record<string, unknown> = value.inputProps ? { ...value.inputProps } : {};
		
		// Extract placeholder from JSON Schema
		if (value.placeholder) {
			inputProps.placeholder = value.placeholder;
		}
		
		// Extract default value from JSON schema and pass it via inputProps
		// Also mark field as not required if it has a default value
		if (value.default !== undefined) {
			inputProps.defaultValue = value.default;
			inputProps.required = false;
		}
		
		if (Object.keys(inputProps).length > 0) {
			config.inputProps = inputProps;
		}

		// Extract order from meta
		if (value.order !== undefined) {
			config.order = value.order;
		}

		// Extract fieldType from JSON Schema meta
		// Also detect date-time format from JSON Schema (from z.date() -> toJSONSchema with override)
		let fieldType = value.fieldType;
		
		// Auto-detect date fields from JSON Schema format: "date-time"
		// This handles the roundtrip: z.date() -> toJSONSchema (with override) -> { type: "string", format: "date-time" }
		if (!fieldType && value.type === "string" && value.format === "date-time") {
			fieldType = "date";
		}

		if (fieldType) {
			// 1. Check if there's a custom component in fieldComponents
			const CustomComponent = fieldComponents?.[fieldType];
			if (CustomComponent) {
				config.fieldType = (props: AutoFormInputComponentProps) => (
					<CustomComponent {...props} />
				);
			}
			// 2. For built-in types, pass through to auto-form
			else if (
				BUILTIN_FIELD_TYPES.includes(
					fieldType as (typeof BUILTIN_FIELD_TYPES)[number],
				)
			) {
				config.fieldType = fieldType;
			}
			// 3. Unknown custom type without a component - log warning and skip
			else {
				console.warn(
					`CMS: Unknown fieldType "${fieldType}" for field "${key}". ` +
						`Provide a component via fieldComponents override or use a built-in type.`,
				);
			}
		}

		// Handle nested object properties recursively
		if (value.properties) {
			const nestedConfig = buildFieldConfigFromJsonSchema(
				{ properties: value.properties } as Record<string, unknown>,
				fieldComponents,
			);
			// Reserved FieldConfigItem property names that should not be overwritten by nested field configs.
			// If a nested field has the same name as a reserved property (e.g., a field named "description"),
			// we skip it to prevent overwriting the parent's config (like its help text).
			const reservedProps = new Set(['description', 'label', 'inputProps', 'fieldType', 'renderParent', 'order']);
			
			// Merge nested config, but skip keys that match reserved property names
			for (const [nestedKey, nestedValue] of Object.entries(nestedConfig)) {
				if (!reservedProps.has(nestedKey)) {
					config[nestedKey] = nestedValue;
				} else {
          console.warn(
            `Field "${key}" has a nested field named "${nestedKey}" which conflicts with a reserved FieldConfigItem property. ` +
            `The nested field's config will not be accessible at the parent level.`
          );
        }
			}
		}

		if (Object.keys(config).length > 0) {
			fieldConfig[key] = config;
		}
	}

	return fieldConfig;
}
