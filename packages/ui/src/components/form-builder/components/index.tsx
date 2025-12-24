import {
  Type,
  Mail,
  Hash,
  AlignLeft,
  CheckSquare,
  ToggleLeft,
  ChevronDown,
  Circle,
  Lock,
  Globe,
  Phone,
  Calendar,
  FolderOpen,
  List,
} from "lucide-react";
import { z } from "zod";
import {
  defineComponent,
  type FormBuilderComponentDefinition,
  type FormBuilderFieldProps,
  type FormBuilderField,
  type StringFieldProps,
  type NumberFieldProps,
  type BooleanFieldProps,
  type DateFieldProps,
  type EnumFieldProps,
  type JSONSchemaProperty,
} from "../types";
import {
  baseMetaSchema,
  baseMetaSchemaWithPlaceholder,
  stringValidationSchema,
  numberValidationSchema,
  booleanValidationSchema,
  dateValidationSchema,
  enumOptionsSchema,
  objectValidationSchema,
  arrayValidationSchema,
  DEFAULT_VALUE_SCHEMAS,
} from "../validation-schemas";

/**
 * Helper to convert a value to a number, handling empty strings and undefined
 */
function toNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

/**
 * Helper to build inputProps object
 */
function buildInputProps(
  placeholder?: string,
  inputType?: string
): { placeholder?: string; type?: string } | undefined {
  const props: { placeholder?: string; type?: string } = {};
  if (placeholder) props.placeholder = placeholder;
  if (inputType) props.type = inputType;
  return Object.keys(props).length > 0 ? props : undefined;
}

/**
 * Helper to extract placeholder from JSONSchemaProperty
 */
function getPlaceholder(prop: JSONSchemaProperty): string | undefined {
  return prop.inputProps?.placeholder || prop.placeholder;
}

/**
 * Helper to extract label from JSONSchemaProperty
 */
function getLabel(prop: JSONSchemaProperty, key: string): string {
  return prop.label || prop.title || key;
}

/**
 * Text Input Field
 */
export const textFieldDefinition = defineComponent<"string">({
  type: "text",
  backingType: "string",
  label: "Text Input",
  icon: Type,
  defaultProps: {
    label: "Text Field",
    placeholder: "",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(stringValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder),
    default: props.defaultValue,
    minLength: toNumber(props.minLength),
    maxLength: toNumber(props.maxLength),
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    // Match string type without enum or special fieldType or inputProps.type
    if (
      prop.type !== "string" ||
      prop.enum ||
      prop.fieldType ||
      prop.inputType ||
      prop.format ||
      prop.inputProps?.type
    ) {
      return null;
    }
    return {
      id: key,
      type: "text",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
        minLength: prop.minLength,
        maxLength: prop.maxLength,
      },
    };
  },
});

/**
 * Email Input Field
 */
export const emailFieldDefinition = defineComponent<"string">({
  type: "email",
  backingType: "string",
  label: "Email",
  icon: Mail,
  defaultProps: {
    label: "Email",
    placeholder: "email@example.com",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder, "email"),
    default: props.defaultValue,
    format: "email",
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (
      prop.type !== "string" ||
      (prop.format !== "email" && prop.inputType !== "email" && prop.inputProps?.type !== "email")
    ) {
      return null;
    }
    return {
      id: key,
      type: "email",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
      },
    };
  },
});

/**
 * Number Input Field
 */
export const numberFieldDefinition = defineComponent<"number">({
  type: "number",
  backingType: "number",
  label: "Number",
  icon: Hash,
  defaultProps: {
    label: "Number",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(numberValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.number })),
  toJSONSchema: (props: NumberFieldProps): JSONSchemaProperty => ({
    type: "number",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder),
    default: props.defaultValue,
    // toNumber handles form input which may come as strings
    minimum: toNumber(props.min),
    maximum: toNumber(props.max),
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "number" && prop.type !== "integer") {
      return null;
    }
    return {
      id: key,
      type: "number",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as number | undefined,
        min: prop.minimum,
        max: prop.maximum,
      },
    };
  },
});

/**
 * Textarea Field
 */
export const textareaFieldDefinition = defineComponent<"string">({
  type: "textarea",
  backingType: "string",
  label: "Text Area",
  icon: AlignLeft,
  defaultProps: {
    label: "Text Area",
    placeholder: "",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(stringValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    fieldType: "textarea",
    inputProps: buildInputProps(props.placeholder),
    default: props.defaultValue,
    minLength: toNumber(props.minLength),
    maxLength: toNumber(props.maxLength),
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "string" || prop.fieldType !== "textarea") {
      return null;
    }
    return {
      id: key,
      type: "textarea",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
        minLength: prop.minLength,
        maxLength: prop.maxLength,
      },
    };
  },
});

/**
 * Checkbox Field
 */
export const checkboxFieldDefinition = defineComponent<"boolean">({
  type: "checkbox",
  backingType: "boolean",
  label: "Checkbox",
  icon: CheckSquare,
  defaultProps: {
    label: "Checkbox",
    required: false,
  },
  propertiesSchema: baseMetaSchema
    .merge(booleanValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.boolean })),
  toJSONSchema: (props: BooleanFieldProps): JSONSchemaProperty => ({
    type: "boolean",
    label: props.label,
    description: props.description,
    default: props.defaultValue,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "boolean" || prop.fieldType === "switch") {
      return null;
    }
    return {
      id: key,
      type: "checkbox",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as boolean | undefined,
      },
    };
  },
});

/**
 * Switch Field
 */
export const switchFieldDefinition = defineComponent<"boolean">({
  type: "switch",
  backingType: "boolean",
  label: "Switch",
  icon: ToggleLeft,
  defaultProps: {
    label: "Switch",
    required: false,
  },
  propertiesSchema: baseMetaSchema
    .merge(booleanValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.boolean })),
  toJSONSchema: (props: BooleanFieldProps): JSONSchemaProperty => ({
    type: "boolean",
    label: props.label,
    description: props.description,
    fieldType: "switch",
    default: props.defaultValue,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "boolean" || prop.fieldType !== "switch") {
      return null;
    }
    return {
      id: key,
      type: "switch",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as boolean | undefined,
      },
    };
  },
});

/**
 * Select Field
 */
export const selectFieldDefinition = defineComponent<"enum">({
  type: "select",
  backingType: "enum",
  label: "Select",
  icon: ChevronDown,
  defaultProps: {
    label: "Select Field",
    required: false,
    options: ["Option 1", "Option 2", "Option 3"],
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(enumOptionsSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.enum })),
  toJSONSchema: (props: EnumFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder),
    default: props.defaultValue,
    enum: props.options,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "string" || !prop.enum || prop.fieldType === "radio") {
      return null;
    }
    return {
      id: key,
      type: "select",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
        options: prop.enum,
      },
    };
  },
});

/**
 * Radio Group Field
 */
export const radioFieldDefinition = defineComponent<"enum">({
  type: "radio",
  backingType: "enum",
  label: "Radio Group",
  icon: Circle,
  defaultProps: {
    label: "Radio Group",
    required: false,
    options: ["Option 1", "Option 2", "Option 3"],
  },
  propertiesSchema: baseMetaSchema
    .merge(enumOptionsSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.enum })),
  toJSONSchema: (props: EnumFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    fieldType: "radio",
    default: props.defaultValue,
    enum: props.options,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "string" || !prop.enum || prop.fieldType !== "radio") {
      return null;
    }
    return {
      id: key,
      type: "radio",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
        options: prop.enum,
      },
    };
  },
});

/**
 * Password Input Field
 */
export const passwordFieldDefinition = defineComponent<"string">({
  type: "password",
  backingType: "string",
  label: "Password",
  icon: Lock,
  defaultProps: {
    label: "Password",
    placeholder: "••••••••",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(stringValidationSchema)
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder, "password"),
    default: props.defaultValue,
    minLength: toNumber(props.minLength),
    maxLength: toNumber(props.maxLength),
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (
      prop.type !== "string" ||
      (prop.inputType !== "password" && prop.inputProps?.type !== "password")
    ) {
      return null;
    }
    return {
      id: key,
      type: "password",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
        minLength: prop.minLength,
        maxLength: prop.maxLength,
      },
    };
  },
});

/**
 * URL/Website Input Field
 */
export const urlFieldDefinition = defineComponent<"string">({
  type: "url",
  backingType: "string",
  label: "Website URL",
  icon: Globe,
  defaultProps: {
    label: "Website",
    placeholder: "https://example.com",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder),
    default: props.defaultValue,
    format: "uri",
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (prop.type !== "string" || prop.format !== "uri") {
      return null;
    }
    return {
      id: key,
      type: "url",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
      },
    };
  },
});

/**
 * Phone Input Field
 */
export const phoneFieldDefinition = defineComponent<"string">({
  type: "phone",
  backingType: "string",
  label: "Phone Number",
  icon: Phone,
  defaultProps: {
    label: "Phone Number",
    placeholder: "+1 (555) 123-4567",
    required: false,
  },
  propertiesSchema: baseMetaSchemaWithPlaceholder
    .merge(z.object({ defaultValue: DEFAULT_VALUE_SCHEMAS.string })),
  toJSONSchema: (props: StringFieldProps): JSONSchemaProperty => ({
    type: "string",
    label: props.label,
    description: props.description,
    inputProps: buildInputProps(props.placeholder, "tel"),
    default: props.defaultValue,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    if (
      prop.type !== "string" ||
      (prop.inputType !== "tel" && prop.inputProps?.type !== "tel")
    ) {
      return null;
    }
    return {
      id: key,
      type: "phone",
      props: {
        label: getLabel(prop, key),
        placeholder: getPlaceholder(prop),
        description: prop.description,
        required: isRequired,
        defaultValue: prop.default as string | undefined,
      },
    };
  },
});

/**
 * Date Picker Field
 * 
 * Stores dates as ISO datetime strings in JSON Schema (format: "date-time")
 * but works with JavaScript Date objects in the form UI.
 */
export const dateFieldDefinition = defineComponent<"date">({
  type: "date",
  backingType: "date",
  label: "Date Picker",
  icon: Calendar,
  defaultProps: {
    label: "Date",
    required: false,
  },
  propertiesSchema: baseMetaSchema
    .merge(dateValidationSchema),
  toJSONSchema: (props: DateFieldProps): JSONSchemaProperty => ({
    type: "string",
    format: "date-time",
    fieldType: "date",
    label: props.label,
    description: props.description,
  }),
  fromJSONSchema: (prop, key, isRequired) => {
    // Match string type with date-time format or explicit date fieldType
    if (
      prop.type !== "string" ||
      (prop.format !== "date-time" && prop.fieldType !== "date")
    ) {
      return null;
    }
    return {
      id: key,
      type: "date",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
      },
    };
  },
});

/**
 * Object Field (Field Group)
 * 
 * A container field that groups other fields together as nested properties.
 * The actual children are stored in field.children and converted by schema-utils.
 */
export const objectFieldDefinition: FormBuilderComponentDefinition = {
  type: "object",
  label: "Field Group",
  icon: FolderOpen,
  defaultProps: {
    label: "Field Group",
    required: false,
  },
  propertiesSchema: baseMetaSchema.extend(objectValidationSchema.shape),
  toJSONSchema: (props: FormBuilderFieldProps): JSONSchemaProperty => ({
    type: "object",
    label: props.label,
    description: props.description,
    // properties will be filled in by schema-utils from field.children
    properties: {},
  }),
  fromJSONSchema: (prop, key, isRequired): FormBuilderField | null => {
    // Match object type with properties (not primitive objects without properties)
    if (prop.type !== "object" || !prop.properties) {
      return null;
    }
    return {
      id: key,
      type: "object",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
      },
      // children will be filled in by schema-utils
      children: [],
    };
  },
};

/**
 * Array Field (Repeating Group)
 * 
 * A container field for repeating items. Each item follows a template defined
 * in field.itemTemplate. The template is converted by schema-utils.
 */
export const arrayFieldDefinition: FormBuilderComponentDefinition = {
  type: "array",
  label: "Repeating Group",
  icon: List,
  defaultProps: {
    label: "Items",
    required: false,
  },
  propertiesSchema: baseMetaSchema.extend(arrayValidationSchema.shape),
  toJSONSchema: (props: FormBuilderFieldProps): JSONSchemaProperty => ({
    type: "array",
    label: props.label,
    description: props.description,
    minItems: props.minItems,
    maxItems: props.maxItems,
    // items will be filled in by schema-utils from field.itemTemplate
    items: {
      type: "object",
      properties: {},
    },
  }),
  fromJSONSchema: (prop, key, isRequired): FormBuilderField | null => {
    // Match array type with object items
    if (prop.type !== "array" || !prop.items) {
      return null;
    }
    return {
      id: key,
      type: "array",
      props: {
        label: getLabel(prop, key),
        description: prop.description,
        required: isRequired,
        minItems: prop.minItems,
        maxItems: prop.maxItems,
      },
      // itemTemplate will be filled in by schema-utils
      itemTemplate: [],
    };
  },
};

/**
 * All default components in order of specificity (more specific first)
 * This order matters for fromJSONSchema matching
 * 
 * Custom field definitions (color, file, image, etc.) should be created by
 * consumers using the exported `defineComponent` utility and passed via the
 * `components` prop.
 */
export const defaultComponents: FormBuilderComponentDefinition[] = [
  // Container types (must be before primitives to match object/array JSON Schema)
  objectFieldDefinition,
  arrayFieldDefinition,
  // Specific types first
  emailFieldDefinition,
  passwordFieldDefinition,
  urlFieldDefinition,
  phoneFieldDefinition,
  dateFieldDefinition,
  textareaFieldDefinition,
  switchFieldDefinition,
  radioFieldDefinition,
  selectFieldDefinition,
  checkboxFieldDefinition,
  numberFieldDefinition,
  // Generic fallback last
  textFieldDefinition,
];

/**
 * Get component definition by type
 */
export function getComponentByType(
  type: string,
  components: FormBuilderComponentDefinition[] = defaultComponents
): FormBuilderComponentDefinition | undefined {
  return components.find((c) => c.type === type);
}
