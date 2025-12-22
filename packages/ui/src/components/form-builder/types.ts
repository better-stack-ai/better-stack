import type { z } from "zod";
import type { 
  JSONSchemaPropertyBase, 
  SerializableInputProps,
  FieldType,
  StringInputProps,
  NumberInputProps,
  BooleanInputProps,
  DateInputProps,
  EnumInputProps,
  InputPropsByBackingType,
} from "../shared-form-types";

// Re-export discriminated input prop types from shared-form-types
export type {
  SerializableInputProps,
  StringInputProps,
  NumberInputProps,
  BooleanInputProps,
  DateInputProps,
  EnumInputProps,
  InputPropsByBackingType,
};

// ============================================================================
// STEP TYPES
// ============================================================================

/**
 * Represents a step in a multi-step form.
 */
export interface FormStep {
  /** Unique identifier for the step */
  id: string;
  /** Display title for the step */
  title: string;
}

/**
 * JSON Schema types for form builder I/O.
 * Extends the shared base types with form-builder specific needs.
 */
export interface JSONSchema {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  $schema?: string;
  /** Step definitions for multi-step forms (stored in schema meta) */
  steps?: FormStep[];
  additionalProperties?: boolean;
}

/**
 * JSON Schema property with form-builder metadata.
 * Extends the shared JSONSchemaPropertyBase for compatibility with auto-form.
 */
export interface JSONSchemaProperty extends Omit<JSONSchemaPropertyBase, "type" | "enum" | "properties" | "items"> {
  /** JSON Schema type - required for form-builder fields */
  type: string;
  /** Enum values for select/radio fields (string-only for form-builder) */
  enum?: string[];
  /** Nested properties for object types (self-referential) */
  properties?: Record<string, JSONSchemaProperty>;
  /** Item schema for array types (self-referential) */
  items?: JSONSchemaProperty;
  /** Minimum items for array types */
  minItems?: number;
  /** Maximum items for array types */
  maxItems?: number;
  /** Step group index for multi-step forms (0-indexed) */
  stepGroup?: number;
}

/**
 * Internal field representation used by form builder.
 */
export interface FormBuilderField {
  id: string;
  type: string;
  props: FormBuilderFieldProps;
  /** Nested fields for object type containers */
  children?: FormBuilderField[];
  /** Template fields defining the shape of each array item */
  itemTemplate?: FormBuilderField[];
  /** Step group index (0-indexed) for multi-step forms */
  stepGroup?: number;
}

/**
 * Backing types supported by form-builder fields.
 */
export type BackingType = keyof InputPropsByBackingType;

// ============================================================================
// COMPONENT TYPE REGISTRY
// ============================================================================

/**
 * Registry mapping component type names to their backing Zod types.
 * This enables compile-time type checking for component definitions.
 */
export const COMPONENT_BACKING_TYPES = {
  text: "string",
  email: "string",
  password: "string",
  url: "string",
  phone: "string",
  textarea: "string",
  number: "number",
  checkbox: "boolean",
  switch: "boolean",
  select: "enum",
  radio: "enum",
  date: "date",
  color: "string", // color picker stores hex string
} as const;

/**
 * All registered component type names.
 */
export type ComponentType = keyof typeof COMPONENT_BACKING_TYPES;

/**
 * Get the backing type for a component type.
 */
export type BackingTypeFor<C extends ComponentType> = typeof COMPONENT_BACKING_TYPES[C];

// ============================================================================
// DISCRIMINATED FIELD PROPS BY BACKING TYPE
// ============================================================================

/**
 * Base properties shared by all form builder fields.
 */
export interface BaseFieldProps {
  /** Display label for the field */
  label: string;
  /** Description text */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Field type override (checkbox, date, select, radio, switch, etc.) */
  fieldType?: FieldType;
  /** Additional input props passed through to the field */
  inputProps?: SerializableInputProps;
}

/**
 * Props for string-backed fields (text, email, password, url, phone, textarea).
 */
export interface StringFieldProps extends BaseFieldProps {
  /** Placeholder text */
  placeholder?: string;
  /** Minimum length */
  minLength?: number;
  /** Maximum length */
  maxLength?: number;
  /** Regex pattern for validation */
  pattern?: string;
  /** HTML input type (text, email, password, tel, url) */
  inputType?: string;
  /** Default value */
  defaultValue?: string;
}

/**
 * Props for number-backed fields.
 */
export interface NumberFieldProps extends BaseFieldProps {
  /** Placeholder text */
  placeholder?: string;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Default value */
  defaultValue?: number;
}

/**
 * Props for boolean-backed fields (checkbox, switch).
 */
export interface BooleanFieldProps extends BaseFieldProps {
  /** Default value */
  defaultValue?: boolean;
}

/**
 * Props for date-backed fields.
 */
export interface DateFieldProps extends BaseFieldProps {
  /** Minimum date */
  minDate?: Date | string;
  /** Maximum date */
  maxDate?: Date | string;
  /** Default value */
  defaultValue?: Date | string;
}

/**
 * Props for enum-backed fields (select, radio).
 */
export interface EnumFieldProps extends BaseFieldProps {
  /** Placeholder text (for select) */
  placeholder?: string;
  /** Options for the select/radio */
  options?: string[];
  /** Default value (must match one of the options) */
  defaultValue?: string;
}

/**
 * Maps backing types to their corresponding field props.
 */
export interface FieldPropsByBackingType {
  string: StringFieldProps;
  number: NumberFieldProps;
  boolean: BooleanFieldProps;
  date: DateFieldProps;
  enum: EnumFieldProps;
}

/**
 * Get the correct field props type for a backing type.
 */
export type FieldPropsFor<T extends BackingType> = FieldPropsByBackingType[T];

/**
 * Union of all discriminated field props.
 */
export type TypedFieldProps = 
  | StringFieldProps
  | NumberFieldProps
  | BooleanFieldProps
  | DateFieldProps
  | EnumFieldProps;

/**
 * Properties for a form builder field.
 * This is the runtime union type used when the backing type is not known.
 * 
 * For type-safe field props, use the discriminated variants:
 * - StringFieldProps for text, email, password, url, phone, textarea
 * - NumberFieldProps for number fields
 * - BooleanFieldProps for checkbox, switch
 * - DateFieldProps for date fields
 * - EnumFieldProps for select, radio
 */
export interface FormBuilderFieldProps extends BaseFieldProps {
  // String field props
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  inputType?: string;
  
  // Number field props
  min?: number;
  max?: number;
  
  // Date field props
  minDate?: Date | string;
  maxDate?: Date | string;
  
  // Enum field props
  options?: string[];
  
  // Array field props
  minItems?: number;
  maxItems?: number;
  
  // Default value (type depends on backing type)
  defaultValue?: unknown;
}

/**
 * Typed component definition for a specific backing type.
 * 
 * Use this when defining components to get type-safe field props:
 * 
 * @example
 * ```typescript
 * const textField: TypedComponentDefinition<"string"> = {
 *   type: "text",
 *   backingType: "string",
 *   defaultProps: { label: "Text", placeholder: "Enter text" }, // ✓ type-safe
 *   // ...
 * };
 * ```
 */
export interface TypedComponentDefinition<T extends BackingType> {
  /** Unique identifier for this component type */
  type: ComponentType | string;
  /** The backing Zod type for this component */
  backingType: T;
  /** Display name shown in the palette */
  label: string;
  /** Icon shown in the palette */
  icon?: React.ComponentType<{ className?: string }>;
  /** Default props when a new field is created - type-safe based on backing type */
  defaultProps: Partial<FieldPropsFor<T>>;
  /** Zod schema for the property panel */
  propertiesSchema: z.ZodObject<z.ZodRawShape>;
  /** Convert field props to JSON Schema property */
  toJSONSchema: (props: FieldPropsFor<T>, isRequired: boolean) => JSONSchemaProperty;
  /** Try to parse a JSON Schema property into this component type */
  fromJSONSchema: (prop: JSONSchemaProperty, key: string, isRequired: boolean) => 
    { id: string; type: string; props: FieldPropsFor<T> } | null;
  /** Optional custom preview component */
  PreviewComponent?: React.ComponentType<{ field: FormBuilderField }>;
}

/**
 * Component definition provided by developers.
 * 
 * This is the runtime type used when the backing type is not known at compile time.
 * For type-safe definitions, use `TypedComponentDefinition<T>`.
 */
export interface FormBuilderComponentDefinition {
  /** Unique identifier for this component type */
  type: string;
  /** The backing Zod type for this component (optional for backwards compatibility) */
  backingType?: BackingType;
  /** Display name shown in the palette */
  label: string;
  /** Icon shown in the palette */
  icon?: React.ComponentType<{ className?: string }>;
  /** Default props when a new field is created */
  defaultProps: Partial<FormBuilderFieldProps>;
  /** Zod schema for the property panel */
  propertiesSchema: z.ZodObject<z.ZodRawShape>;
  /** Convert field props to JSON Schema property */
  toJSONSchema: (props: FormBuilderFieldProps, isRequired: boolean) => JSONSchemaProperty;
  /** Try to parse a JSON Schema property into this component type */
  fromJSONSchema: (prop: JSONSchemaProperty, key: string, isRequired: boolean) => FormBuilderField | null;
  /** Optional custom preview component */
  PreviewComponent?: React.ComponentType<{ field: FormBuilderField }>;
}

/**
 * Helper to create a type-safe component definition.
 * The returned definition is assignable to FormBuilderComponentDefinition.
 */
export function defineComponent<T extends BackingType>(
  def: TypedComponentDefinition<T>
): FormBuilderComponentDefinition {
  return def as unknown as FormBuilderComponentDefinition;
}

/**
 * Form builder context for sharing state
 */
export interface FormBuilderContextValue {
  fields: FormBuilderField[];
  components: FormBuilderComponentDefinition[];
  mode: "build" | "preview";
  setFields: (fields: FormBuilderField[]) => void;
  setMode: (mode: "build" | "preview") => void;
  addField: (componentType: string, index?: number) => void;
  updateField: (id: string, props: Partial<FormBuilderFieldProps>) => void;
  removeField: (id: string) => void;
  moveField: (fromIndex: number, toIndex: number) => void;
}

/**
 * Drag data types for dnd-kit
 */
export interface PaletteDragData {
  type: "palette";
  componentType: string;
}

export interface FieldDragData {
  type: "field";
  fieldId: string;
  index: number;
}

export type DragData = PaletteDragData | FieldDragData;
