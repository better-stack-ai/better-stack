"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AutoForm from "@workspace/ui/components/auto-form";
import { cn } from "@workspace/ui/lib/utils";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/utils";
import type { FormBuilderField, FormBuilderComponentDefinition, FormBuilderFieldProps } from "./types";

interface PropertyPanelProps {
  field: FormBuilderField | null;
  component: FormBuilderComponentDefinition | null;
  onUpdate: (props: Partial<FormBuilderFieldProps>) => void;
  className?: string;
}

export function PropertyPanel({
  field,
  component,
  onUpdate,
  className,
}: PropertyPanelProps) {
  // Track form values locally for controlled updates
  const [formKey, setFormKey] = useState(0);

  // Reset form when field changes
  useEffect(() => {
    setFormKey((k) => k + 1);
  }, [field?.id]);

  // Convert field props to form values
  const formValues = useMemo(() => {
    if (!field) return undefined;

    // Handle special case for options (array to string)
    const values: Record<string, unknown> = { ...field.props };
    if (Array.isArray(values.options)) {
      values.options = (values.options as string[]).join("\n");
    }

    return values;
  }, [field]);

  // Handle form value changes
  const handleValuesChange = useCallback(
    (values: Record<string, unknown>) => {
      if (!field) return;

      // Handle special case for options (string to array)
      const props: Partial<FormBuilderFieldProps> = { ...values };
      if (typeof props.options === "string") {
        props.options = (props.options as string)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      onUpdate(props);
    },
    [field, onUpdate]
  );

  if (!field || !component) {
    return (
      <div className={cn("p-4", className)}>
        <h3 className="text-sm font-semibold text-muted-foreground mb-4">
          Properties
        </h3>
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Select a field to edit its properties
        </div>
      </div>
    );
  }

  const Icon = component.icon as React.ComponentType<{ className?: string }>;

  // Build field config from the schema metadata
  const jsonSchema = component.propertiesSchema.toJSONSchema() as Record<string, unknown>;
  const fieldConfig = buildFieldConfigFromJsonSchema(jsonSchema);

  return (
    <div className={cn("p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        <h3 className="text-sm font-semibold">{component.label}</h3>
      </div>

      <AutoForm
        key={formKey}
        formSchema={component.propertiesSchema}
        values={formValues}
        onValuesChange={handleValuesChange}
        fieldConfig={fieldConfig}
        className="space-y-4"
      />
    </div>
  );
}
