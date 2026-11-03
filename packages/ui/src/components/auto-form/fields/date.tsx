import { DatePicker } from "@workspace/ui/components/date-picker";
import { FormControl, FormItem, FormMessage } from "@workspace/ui/components/form";
import { z } from "zod";
import AutoFormLabel from "../common/label";
import AutoFormTooltip from "../common/tooltip";
import type { AutoFormInputComponentProps } from "../types";
import { getBaseSchema, getBaseType } from "../helpers";

/**
 * Convert a value to a Date object if needed.
 * Handles both Date objects (from z.date()) and ISO strings (from z.fromJSONSchema with format: date-time)
 */
function toDate(value: unknown, dateOnly: boolean): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const date = new Date(dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

export default function AutoFormDate({
  label,
  isRequired,
  field,
  fieldConfigItem,
  fieldProps,
  zodItem,
}: AutoFormInputComponentProps) {
  // Determine if the underlying schema expects a Date object or string
  // z.date() has base type "ZodDate", while z.fromJSONSchema with format: date-time creates a ZodString
  const baseType = getBaseType(zodItem);
  const expectsDateObject = baseType === "ZodDate";
  const baseSchema = getBaseSchema(zodItem);
  // Stored nullable JSON Schema dates reconstruct as a date-string/null union.
  const dateSchema = baseSchema instanceof z.ZodUnion && baseSchema.options.length === 2 && baseSchema.options.some((option) => option instanceof z.ZodNull)
    ? baseSchema.options.find((option) => !(option instanceof z.ZodNull))
    : baseSchema;
  const expectsDateOnly = !!dateSchema && (
    ("format" in dateSchema && dateSchema.format === "date") ||
    (dateSchema instanceof z.ZodString && !!dateSchema._zod.def.checks?.some((check) => "format" in check._zod.def && check._zod.def.format === "date"))
  );
  
  const handleChange = (date: Date | undefined) => {
    if (!date) {
      field.onChange(expectsDateOnly && zodItem.isNullable() ? null : undefined);
      return;
    }
    // If the schema is z.date(), pass Date object
    // If the schema is string (from JSON Schema), pass ISO string
    if (expectsDateObject) {
      field.onChange(date);
    } else if (expectsDateOnly) {
      field.onChange(`${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    } else {
      field.onChange(date.toISOString());
    }
  };

  return (
    <FormItem>
      <AutoFormLabel
        label={fieldConfigItem?.label || label}
        isRequired={isRequired}
      />
      <FormControl>
        <DatePicker
          date={toDate(field.value, expectsDateOnly)}
          setDate={handleChange}
          {...fieldProps}
        />
      </FormControl>
      <AutoFormTooltip fieldConfigItem={fieldConfigItem} />

      <FormMessage />
    </FormItem>
  );
}
