"use client";

import { useCallback, useMemo, useState } from "react";
import AutoForm from "@workspace/ui/components/auto-form";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/helpers";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type {
  FormBuilderField,
  FormBuilderComponentDefinition,
  FormBuilderFieldProps,
  FormStep,
} from "./types";

interface EditFieldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FormBuilderField | null;
  component: FormBuilderComponentDefinition | null;
  onUpdate: (id: string, props: Partial<FormBuilderFieldProps>, newId?: string, stepGroup?: number) => void;
  /** Steps for multi-step forms */
  steps?: FormStep[];
  /** All existing field IDs for duplicate validation */
  allFieldIds?: string[];
}

export function EditFieldDialog({
  open,
  onOpenChange,
  field,
  component,
  onUpdate,
  steps = [],
  allFieldIds = [],
}: EditFieldDialogProps) {
  // Compute initial values when field or dialog state changes
  // We intentionally reset when `open` changes to reinitialize the form
  const initialValues = useMemo(() => {
    if (!field) return { fieldName: "", props: {}, key: "" };
    const values: Record<string, unknown> = { ...field.props };
    if (Array.isArray(values.options)) {
      values.options = (values.options as string[]).join("\n");
    }
    return { fieldName: field.id, props: values, key: `${field.id}-${open}` };
  }, [field, open]);

  // Track form values locally with overrides
  const [fieldNameOverride, setFieldNameOverride] = useState<string | null>(null);
  const [localPropsOverride, setLocalPropsOverride] = useState<Record<string, unknown> | null>(null);
  const [stepGroupOverride, setStepGroupOverride] = useState<number | null>(null);

  // Use override if set, otherwise use initial values
  const fieldName = fieldNameOverride ?? initialValues.fieldName;
  const localProps = localPropsOverride ?? initialValues.props;
  const localStepGroup = stepGroupOverride ?? field?.stepGroup ?? 0;

  // Check for duplicate field ID (only when changing to a different ID)
  const isDuplicateId = useMemo(() => {
    if (!field || fieldName === field.id) return false;
    return allFieldIds.some((id) => id === fieldName && id !== field.id);
  }, [fieldName, field, allFieldIds]);

  // Reset overrides when initial values change
  const [prevInitial, setPrevInitial] = useState(initialValues);
  if (prevInitial !== initialValues) {
    setPrevInitial(initialValues);
    setFieldNameOverride(null);
    setLocalPropsOverride(null);
    setStepGroupOverride(null);
  }

  // Form key for AutoForm reset
  const formKey = initialValues.key;

  // Handle form value changes
  const handleValuesChange = useCallback(
    (values: Record<string, unknown>) => {
      setLocalPropsOverride(values);
    },
    []
  );

  // Handle save
  const handleSave = useCallback(() => {
    if (!field) return;

    // Handle special case for options (string to array)
    const props: Partial<FormBuilderFieldProps> = { ...localProps };
    if (typeof props.options === "string") {
      props.options = (props.options as string)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Determine if we need to update the ID
    const newId = fieldName !== field.id ? fieldName : undefined;
    
    // Determine if we need to update the step group
    // Only pass stepGroup if it was explicitly changed from the field's current value
    const stepGroup = stepGroupOverride !== null && stepGroupOverride !== field.stepGroup 
      ? stepGroupOverride 
      : undefined;
    
    // Single atomic update for props, ID, and step group
    onUpdate(field.id, props, newId, stepGroup);
    
    onOpenChange(false);
  }, [field, localProps, fieldName, onUpdate, onOpenChange, stepGroupOverride]);

  if (!field || !component) {
    return null;
  }

  const Icon = component.icon as React.ComponentType<{ className?: string }>;

  // Build field config from the schema metadata
  const jsonSchema = component.propertiesSchema.toJSONSchema() as Record<string, unknown>;
  const fieldConfig = buildFieldConfigFromJsonSchema(jsonSchema);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
            Edit {component.label}
          </DialogTitle>
          <DialogDescription>
            Configure the properties for this field
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Field Name */}
          <div className="space-y-2">
            <Label htmlFor="field-name">Field Name</Label>
            <Input
              id="field-name"
              value={fieldName}
              onChange={(e) => setFieldNameOverride(e.target.value)}
              placeholder="Enter field name"
              className={isDuplicateId ? "border-destructive focus-visible:ring-destructive" : ""}
              aria-invalid={isDuplicateId}
            />
            {isDuplicateId ? (
              <p className="text-xs text-destructive">
                A field with this name already exists. Please choose a different name.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This is the key used in the form data and JSON schema
              </p>
            )}
          </div>

          {/* Step Selector (only shown when multiple steps exist) */}
          {steps.length > 1 && field && (
            <div className="space-y-2">
              <Label htmlFor="field-step">Step</Label>
              <Select
                value={String(localStepGroup)}
                onValueChange={(value) => setStepGroupOverride(parseInt(value, 10))}
              >
                <SelectTrigger id="field-step">
                  <SelectValue placeholder="Select step" />
                </SelectTrigger>
                <SelectContent>
                  {steps.map((step, index) => (
                    <SelectItem key={step.id} value={String(index)}>
                      {step.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which step this field belongs to
              </p>
            </div>
          )}

          {/* Properties Form */}
          <div className="border-t pt-4">
            <AutoForm
              key={formKey}
              formSchema={component.propertiesSchema}
              values={localProps}
              onValuesChange={handleValuesChange}
              fieldConfig={fieldConfig}
              className="space-y-4"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isDuplicateId}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
