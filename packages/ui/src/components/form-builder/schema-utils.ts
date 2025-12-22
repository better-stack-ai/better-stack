import type {
  FormBuilderComponentDefinition,
  FormBuilderField,
  FormStep,
  JSONSchema,
  JSONSchemaProperty,
} from "./types";

/**
 * Helper to convert fields to JSON Schema properties (recursive)
 * @param includeStepGroup - Whether to include stepGroup in the schema (only for multi-step forms)
 */
function fieldsToProperties(
  fields: FormBuilderField[],
  components: FormBuilderComponentDefinition[],
  includeStepGroup: boolean = false
): Record<string, JSONSchemaProperty> {
  const properties: Record<string, JSONSchemaProperty> = {};

  for (const field of fields) {
    const component = components.find((c) => c.type === field.type);
    if (!component) {
      console.warn(`Unknown component type: ${field.type}`);
      continue;
    }

    const isRequired = field.props.required ?? false;
    const schemaProp = component.toJSONSchema(field.props, isRequired);

    // Add stepGroup if we're in multi-step mode and field has a stepGroup
    if (includeStepGroup && field.stepGroup !== undefined) {
      schemaProp.stepGroup = field.stepGroup;
    }

    // Handle nested object fields
    if (field.type === "object" && field.children && field.children.length > 0) {
      schemaProp.properties = fieldsToProperties(field.children, components, false);
      const childRequired = field.children
        .filter((child) => child.props.required)
        .map((child) => child.id);
      if (childRequired.length > 0) {
        schemaProp.required = childRequired;
      }
    }

    // Handle nested array fields
    if (field.type === "array" && field.itemTemplate && field.itemTemplate.length > 0) {
      schemaProp.items = {
        type: "object",
        properties: fieldsToProperties(field.itemTemplate, components, false),
      };
      const itemRequired = field.itemTemplate
        .filter((item) => item.props.required)
        .map((item) => item.id);
      if (itemRequired.length > 0) {
        schemaProp.items.required = itemRequired;
      }
    }

    properties[field.id] = schemaProp;
  }

  return properties;
}

/**
 * Helper to get required field IDs from a list of fields
 */
function getRequiredFieldIds(fields: FormBuilderField[]): string[] {
  return fields.filter((f) => f.props.required).map((f) => f.id);
}

/**
 * Convert internal fields to JSON Schema
 * @param steps - Optional steps array for multi-step forms
 */
export function fieldsToJSONSchema(
  fields: FormBuilderField[],
  components: FormBuilderComponentDefinition[],
  steps?: FormStep[]
): JSONSchema {
  // Include stepGroup in properties only if we have multiple steps
  const hasMultipleSteps = steps && steps.length > 1;
  const properties = fieldsToProperties(fields, components, hasMultipleSteps);
  const required = getRequiredFieldIds(fields);

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    // Only include steps if there are multiple steps
    ...(hasMultipleSteps ? { steps } : {}),
  };
}

/**
 * Helper to parse JSON Schema properties into fields (recursive)
 */
function propertiesToFields(
  properties: Record<string, JSONSchemaProperty>,
  requiredSet: Set<string>,
  components: FormBuilderComponentDefinition[]
): FormBuilderField[] {
  const fields: FormBuilderField[] = [];

  for (const [key, prop] of Object.entries(properties)) {
    const isRequired = requiredSet.has(key);
    let field: FormBuilderField | null = null;

    // Try each component's fromJSONSchema in order
    // Components are ordered by specificity (more specific first)
    for (const component of components) {
      field = component.fromJSONSchema(prop, key, isRequired);
      if (field) {
        break;
      }
    }

    if (field) {
      // Extract stepGroup from the property if present
      if (prop.stepGroup !== undefined) {
        field.stepGroup = prop.stepGroup;
      }

      // Handle nested object fields
      if (field.type === "object" && prop.properties) {
        const childRequiredSet = new Set(prop.required || []);
        field.children = propertiesToFields(prop.properties, childRequiredSet, components);
      }

      // Handle nested array fields
      if (field.type === "array" && prop.items?.properties) {
        const itemRequiredSet = new Set(prop.items.required || []);
        field.itemTemplate = propertiesToFields(prop.items.properties, itemRequiredSet, components);
      }

      fields.push(field);
    } else {
      // Fallback: create a generic text field for unknown types
      console.warn(`Could not parse JSON Schema property: ${key}`, prop);
      fields.push({
        id: key,
        type: "text",
        props: {
          label: prop.title || key,
          description: prop.description,
          placeholder: prop.placeholder,
          required: isRequired,
        },
        // Include stepGroup even for fallback fields
        ...(prop.stepGroup !== undefined ? { stepGroup: prop.stepGroup } : {}),
      });
    }
  }

  return fields;
}

/**
 * Result of parsing a JSON Schema
 */
export interface ParsedSchema {
  fields: FormBuilderField[];
  steps: FormStep[];
}

/**
 * Convert JSON Schema to internal fields and extract steps
 */
export function jsonSchemaToFieldsAndSteps(
  schema: JSONSchema | null | undefined,
  components: FormBuilderComponentDefinition[]
): ParsedSchema {
  if (!schema || !schema.properties) {
    return { fields: [], steps: [] };
  }

  const requiredSet = new Set(schema.required || []);
  const fields = propertiesToFields(schema.properties, requiredSet, components);
  const steps = schema.steps || [];

  return { fields, steps };
}

/**
 * Convert JSON Schema to internal fields
 * @deprecated Use jsonSchemaToFieldsAndSteps for multi-step support
 */
export function jsonSchemaToFields(
  schema: JSONSchema | null | undefined,
  components: FormBuilderComponentDefinition[]
): FormBuilderField[] {
  return jsonSchemaToFieldsAndSteps(schema, components).fields;
}

/**
 * Generate a unique field ID
 */
export function generateFieldId(prefix: string = "field"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize a field ID to be a valid JSON Schema property key
 */
export function sanitizeFieldId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
}

/**
 * Generate a unique step ID
 */
export function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new step with default title
 */
export function createStep(index: number): FormStep {
  return {
    id: generateStepId(),
    title: `Step ${index + 1}`,
  };
}
