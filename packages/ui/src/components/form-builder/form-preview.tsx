"use client";

import { useState, useMemo } from "react";
import { z } from "zod";
import { SteppedAutoForm } from "@workspace/ui/components/auto-form/stepped-auto-form";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/utils";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import type { JSONSchema } from "./types";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

interface FormPreviewProps {
  schema: JSONSchema;
  className?: string;
  /** 
   * Additional custom field components to use in the form preview.
   * These are merged with the default components (color picker, etc.).
   */
  fieldComponents?: Record<string, React.ComponentType<AutoFormInputComponentProps>>;
  /**
   * Default values to pre-populate the form with.
   * Useful for edit scenarios where the form should start with existing data.
   */
  defaultValues?: Record<string, unknown>;
}

export function FormPreview({ schema, className, fieldComponents, defaultValues }: FormPreviewProps) {
  const [submittedValues, setSubmittedValues] = useState<Record<string, unknown> | null>(null);

  // Create Zod schema from JSON Schema, preserving steps metadata
  const zodSchema = useMemo(() => {
    try {
      if (!schema.properties || Object.keys(schema.properties).length === 0) {
        return null;
      }
      let baseSchema = z.fromJSONSchema(schema as unknown as z.core.JSONSchema.JSONSchema);
      
      // Re-attach steps metadata to the Zod schema so it survives toJSONSchema() roundtrip
      // z.fromJSONSchema() doesn't preserve custom properties like 'steps'
      if (schema.steps && schema.steps.length > 0) {
        // Build stepGroup map from the original JSON Schema properties
        const stepGroupMap: Record<string, number> = {};
        for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
          if (typeof fieldSchema.stepGroup === "number") {
            stepGroupMap[fieldName] = fieldSchema.stepGroup;
          }
        }
        
        // Add steps and stepGroup metadata to the schema
        baseSchema = baseSchema.meta({ 
          steps: schema.steps,
          stepGroupMap 
        });
      }
      
      return baseSchema;
    } catch (error) {
      console.error("Failed to parse JSON Schema:", error);
      return null;
    }
  }, [schema]);

  // Custom field components for rendering (passed via props)
  const mergedFieldComponents = useMemo(() => fieldComponents ?? {}, [fieldComponents]);

  // Build field config from JSON Schema with custom components
  const fieldConfig = useMemo(() => {
    try {
      return buildFieldConfigFromJsonSchema(
        schema as unknown as Record<string, unknown>,
        mergedFieldComponents
      );
    } catch (error) {
      console.error("Failed to build field config:", error);
      return {};
    }
  }, [schema, mergedFieldComponents]);

  const handleSubmit = (values: unknown) => {
    setSubmittedValues(values as Record<string, unknown>);
  };

  const handleReset = () => {
    setSubmittedValues(null);
  };

  if (!zodSchema) {
    return (
      <div className={cn("p-8 text-center text-muted-foreground", className)}>
        <p className="text-lg font-medium mb-2">No fields to preview</p>
        <p className="text-sm">Add some fields to your form to see a preview</p>
      </div>
    );
  }

  return (
    <div className={cn("p-4 md:p-6", className)}>
      <div className="max-w-2xl mx-auto">
        {submittedValues ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Submitted Values</h3>
              <Button variant="outline" onClick={handleReset}>
                Try Again
              </Button>
            </div>
            <div className="rounded-lg border bg-muted/50 p-4">
              <pre className="text-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(submittedValues, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold">Form Preview</h3>
              <p className="text-sm text-muted-foreground">
                Test your form and see the submitted values
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <SteppedAutoForm
                formSchema={zodSchema}
                onSubmit={handleSubmit}
                fieldConfig={fieldConfig}
                values={defaultValues}
                submitButtonText="Submit"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
