"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import AutoForm from "./index";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { FieldConfig } from "./types";
import type { ZodObjectOrWrapped } from "./helpers";

export default SteppedAutoForm;
export { SteppedAutoForm };
export type { SteppedAutoFormProps, StepperComponentProps };

// ============================================================================
// TYPES
// ============================================================================

interface FormStep {
  id: string;
  title: string;
}

interface StepperComponentProps {
  steps: Array<{ id: string; label: string }>;
  currentStepIndex: number;
  currentStepId: string;
  onStepClick?: (stepId: string) => void;
  isFirst: boolean;
  isLast: boolean;
}

interface SteppedAutoFormProps<SchemaType extends ZodObjectOrWrapped> {
  // Same props as AutoForm
  formSchema: SchemaType;
  values?: Partial<z.infer<SchemaType>>;
  onValuesChange?: (
    values: Partial<z.infer<SchemaType>>,
    form?: UseFormReturn<z.infer<SchemaType>>
  ) => void;
  onSubmit?: (values: z.infer<SchemaType>) => void;
  fieldConfig?: FieldConfig<z.infer<SchemaType>>;
  children?: React.ReactNode;
  className?: string;

  // Stepper customization
  nextButtonText?: string;
  backButtonText?: string;
  submitButtonText?: string;
  StepperComponent?: React.ComponentType<StepperComponentProps>;
  
  /** Whether the form is currently submitting. Disables submit/next buttons to prevent duplicate submissions. */
  isSubmitting?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract steps from a Zod schema's JSON Schema representation.
 * Steps are stored in the schema's .meta() and serialized to JSON Schema.
 */
function extractStepsFromSchema(schema: z.ZodType): FormStep[] {
  try {
    const jsonSchema = schema.toJSONSchema() as Record<string, unknown>;
    // Steps are added via .meta({ steps }) and serialized at root level
    if (jsonSchema.steps && Array.isArray(jsonSchema.steps)) {
      return jsonSchema.steps as FormStep[];
    }
  } catch {
    // Schema doesn't support toJSONSchema or doesn't have steps
  }
  return [];
}

/**
 * Get field names and their step assignments from JSON Schema.
 * We check both the stepGroupMap from meta and individual field stepGroup properties.
 */
function getFieldStepAssignments(
  schema: z.ZodType
): Map<string, number> {
  const assignments = new Map<string, number>();
  try {
    const jsonSchema = schema.toJSONSchema() as Record<string, unknown>;
    
    // First, check for stepGroupMap in meta (added when converting from JSON Schema)
    const stepGroupMap = jsonSchema.stepGroupMap as Record<string, number> | undefined;
    if (stepGroupMap) {
      for (const [fieldName, stepGroup] of Object.entries(stepGroupMap)) {
        assignments.set(fieldName, stepGroup);
      }
      return assignments;
    }
    
    // Fallback: check individual field properties for stepGroup
    const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        const stepGroup = fieldSchema.stepGroup;
        if (typeof stepGroup === "number") {
          assignments.set(fieldName, stepGroup);
        } else {
          // Default to step 0 if not specified
          assignments.set(fieldName, 0);
        }
      }
    }
  } catch {
    // Schema doesn't support toJSONSchema
  }
  return assignments;
}

/**
 * Create a partial schema for a specific step by picking only fields that belong to that step
 */
function createStepSchema<T extends z.ZodObject<z.ZodRawShape>>(
  fullSchema: T,
  stepIndex: number,
  fieldAssignments: Map<string, number>
): z.ZodObject<z.ZodRawShape> {
  const fieldsForStep = Array.from(fieldAssignments.entries())
    .filter(([, step]) => step === stepIndex)
    .map(([field]) => field);

  if (fieldsForStep.length === 0) {
    // Return empty object schema if no fields
    return z.object({});
  }

  // Create pick object
  const pickObject: Record<string, true> = {};
  for (const field of fieldsForStep) {
    pickObject[field] = true;
  }

  return fullSchema.pick(pickObject) as z.ZodObject<z.ZodRawShape>;
}

/**
 * Get the inner schema from wrapped Zod types (effects, optional, etc.)
 * In Zod v4, we use duck typing to detect schema types
 */
function getObjectSchema(schema: z.ZodType): z.ZodObject<z.ZodRawShape> | null {
  // Check if it's a ZodObject by checking for shape property
  if (schema instanceof z.ZodObject) {
    return schema as z.ZodObject<z.ZodRawShape>;
  }
  
  // For wrapped types (effects, optional, nullable), try to access inner schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaDef = (schema as any)._zod?.def ?? (schema as any)._def;
  if (schemaDef) {
    // ZodEffects has schema property
    if (schemaDef.schema) {
      return getObjectSchema(schemaDef.schema);
    }
    // ZodOptional/ZodNullable have innerType
    if (schemaDef.innerType) {
      return getObjectSchema(schemaDef.innerType);
    }
  }
  
  return null;
}

// ============================================================================
// DEFAULT STEPPER COMPONENT
// ============================================================================

function DefaultStepper({
  steps,
  currentStepIndex,
  onStepClick,
}: StepperComponentProps) {
  return (
    <nav aria-label="Form Steps" className="mb-6">
      <ol className="flex items-center justify-between gap-2">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <li className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant={index <= currentStepIndex ? "default" : "secondary"}
                aria-current={currentStepIndex === index ? "step" : undefined}
                aria-posinset={index + 1}
                aria-setsize={steps.length}
                className="size-10 rounded-full p-0"
                onClick={() => onStepClick?.(step.id)}
              >
                {index + 1}
              </Button>
              <span className="text-sm font-medium hidden sm:inline">
                {step.label}
              </span>
            </li>
            {index < steps.length - 1 && (
              <Separator
                className={cn(
                  "flex-1 min-w-4",
                  index < currentStepIndex ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
}

// ============================================================================
// STEPPED AUTO FORM COMPONENT
// ============================================================================

function SteppedAutoForm<SchemaType extends ZodObjectOrWrapped>({
  formSchema,
  values: initialValues,
  onValuesChange,
  onSubmit,
  fieldConfig,
  children,
  className,
  nextButtonText = "Next",
  backButtonText = "Back",
  submitButtonText = "Submit",
  StepperComponent = DefaultStepper,
  isSubmitting = false,
}: SteppedAutoFormProps<SchemaType>) {
  // Extract steps from schema
  const steps = useMemo(() => extractStepsFromSchema(formSchema), [formSchema]);
  const hasMultipleSteps = steps.length > 1;

  // Get field assignments
  const fieldAssignments = useMemo(
    () => getFieldStepAssignments(formSchema),
    [formSchema]
  );

  // State for multi-step form
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [accumulatedValues, setAccumulatedValues] = useState<Record<string, unknown>>(
    (initialValues as Record<string, unknown>) ?? {}
  );
  // Track which steps have been validated/completed (by step index)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  // Track schema validation errors (for cross-field validations)
  const [schemaErrors, setSchemaErrors] = useState<z.ZodError | null>(null);

  // Refs to avoid stale closures in callbacks - ensures we always have latest values
  const accumulatedValuesRef = useRef(accumulatedValues);
  const onValuesChangeRef = useRef(onValuesChange);
  
  // Keep refs in sync with current values
  useEffect(() => {
    accumulatedValuesRef.current = accumulatedValues;
  }, [accumulatedValues]);
  
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);

  // Sync accumulated values when the values prop changes externally
  // This handles async loading scenarios where data arrives after mount
  useEffect(() => {
    if (initialValues) {
      const newValues = {
        ...accumulatedValuesRef.current,
        ...(initialValues as Record<string, unknown>),
      };
      accumulatedValuesRef.current = newValues;
      setAccumulatedValues(newValues);
    }
  }, [initialValues]);

  // Get the object schema
  const objectSchema = useMemo(() => getObjectSchema(formSchema), [formSchema]);

  // Create per-step schemas
  const stepSchemas = useMemo(() => {
    if (!hasMultipleSteps || !objectSchema) return [];
    return steps.map((_, index) =>
      createStepSchema(objectSchema, index, fieldAssignments)
    );
  }, [hasMultipleSteps, objectSchema, steps, fieldAssignments]);

  // Current step info
  const currentStep = steps[currentStepIndex];
  const currentStepSchema = stepSchemas[currentStepIndex];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === steps.length - 1;

  // Build field config for current step
  const currentStepFieldConfig = useMemo(() => {
    if (!fieldConfig) return undefined;
    // Filter field config to only include fields for current step
    const stepFields = Array.from(fieldAssignments.entries())
      .filter(([, step]) => step === currentStepIndex)
      .map(([field]) => field);
    
    const filtered: Record<string, unknown> = {};
    for (const field of stepFields) {
      if (field in (fieldConfig as Record<string, unknown>)) {
        filtered[field] = (fieldConfig as Record<string, unknown>)[field];
      }
    }
    return filtered as FieldConfig<z.infer<SchemaType>>;
  }, [fieldConfig, fieldAssignments, currentStepIndex]);

  // Get values for current step
  const currentStepValues = useMemo(() => {
    const stepFields = Array.from(fieldAssignments.entries())
      .filter(([, step]) => step === currentStepIndex)
      .map(([field]) => field);
    
    const values: Record<string, unknown> = {};
    for (const field of stepFields) {
      if (field in accumulatedValues) {
        values[field] = accumulatedValues[field];
      }
    }
    return values;
  }, [fieldAssignments, currentStepIndex, accumulatedValues]);

  // Handle step navigation - only allow navigation to completed steps or the current step
  const handleStepClick = useCallback(
    (stepId: string) => {
      const stepIndex = steps.findIndex((s) => s.id === stepId);
      if (stepIndex === -1) return;
      
      // Allow navigation only to:
      // - The current step
      // - Previously completed steps
      // - The next step after current (if current step is completed)
      const canNavigate =
        stepIndex === currentStepIndex ||
        completedSteps.has(stepIndex) ||
        (stepIndex === currentStepIndex + 1 && completedSteps.has(currentStepIndex));
      
      if (canNavigate) {
        setCurrentStepIndex(stepIndex);
        // Clear schema errors when navigating to allow user to retry
        setSchemaErrors(null);
      }
    },
    [steps, currentStepIndex, completedSteps]
  );

  // Handle step value changes - accumulate and notify parent
  // Uses refs to avoid stale closures, ensuring values from other steps are preserved
  const handleStepValuesChange = useCallback(
    (stepValues: Record<string, unknown>, form?: UseFormReturn<Record<string, unknown>>) => {
      // stepValues contains only the current step's fields, merge with latest accumulated values
      const newAccumulated = { ...accumulatedValuesRef.current, ...stepValues };
      accumulatedValuesRef.current = newAccumulated;
      setAccumulatedValues(newAccumulated);
      // Notify parent of accumulated values (form is undefined for multi-step as we don't have a single form instance)
      onValuesChangeRef.current?.(newAccumulated as Partial<z.infer<SchemaType>>, form as UseFormReturn<z.infer<SchemaType>> | undefined);
    },
    []
  );

  // Handle step submission - AutoForm validates per-step, we just accumulate and track completion
  // Uses refs to avoid stale closures, ensuring values from other steps are preserved
  const handleStepSubmit = useCallback(
    (stepValues: Record<string, unknown>) => {
      // AutoForm has already validated the current step's fields via zodResolver
      const newAccumulated = { ...accumulatedValuesRef.current, ...stepValues };
      accumulatedValuesRef.current = newAccumulated;
      setAccumulatedValues(newAccumulated);
      
      // Notify parent of accumulated values (form is undefined for multi-step as we don't have a single form instance)
      onValuesChangeRef.current?.(newAccumulated as Partial<z.infer<SchemaType>>, undefined);
      
      // Mark current step as completed (validation passed via AutoForm)
      setCompletedSteps((prev) => new Set([...prev, currentStepIndex]));

      if (isLast) {
        // Final submit - check all steps completed and validate full schema
        const allStepsCompleted = steps.every(
          (_, index) => index === currentStepIndex || completedSteps.has(index)
        );
        
        if (!allStepsCompleted) {
          // Navigate to first incomplete step
          const firstIncompleteStep = steps.findIndex(
            (_, index) => index !== currentStepIndex && !completedSteps.has(index)
          );
          if (firstIncompleteStep !== -1) {
            setCurrentStepIndex(firstIncompleteStep);
            return;
          }
        }
        
        // Validate against full schema (handles cross-field validations)
        const parseResult = formSchema.safeParse(newAccumulated);
        if (parseResult.success) {
          setSchemaErrors(null);
          onSubmit?.(parseResult.data as z.infer<SchemaType>);
        } else {
          // Store errors to display to the user
          setSchemaErrors(parseResult.error);
          
          // Try to navigate to the step containing the first error
          const firstErrorPath = parseResult.error.issues[0]?.path[0];
          if (typeof firstErrorPath === "string") {
            const errorFieldStep = fieldAssignments.get(firstErrorPath);
            if (errorFieldStep !== undefined && errorFieldStep !== currentStepIndex) {
              setCurrentStepIndex(errorFieldStep);
            }
          }
        }
      } else {
        // Move to next step
        setCurrentStepIndex((prev) => prev + 1);
        }
      },
    [isLast, onSubmit, currentStepIndex, steps, completedSteps, formSchema, fieldAssignments]
  );

  // Handle back button
  const handleBack = useCallback(() => {
    if (!isFirst) {
      setCurrentStepIndex((prev) => prev - 1);
      // Clear schema errors when navigating to allow user to retry
      setSchemaErrors(null);
    }
  }, [isFirst]);

  // If no multiple steps, delegate to regular AutoForm
  if (!hasMultipleSteps) {
    return (
      <AutoForm
        formSchema={formSchema}
        values={initialValues}
        onValuesChange={onValuesChange}
        onSubmit={onSubmit}
        fieldConfig={fieldConfig}
        className={className}
      >
        <Button type="submit" disabled={isSubmitting} className="w-full mt-4">
          {submitButtonText}
        </Button>
        {children}
      </AutoForm>
    );
  }

  // Multi-step form rendering
  if (!currentStepSchema || !currentStep) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Stepper Header */}
      <StepperComponent
        steps={steps.map((s) => ({ id: s.id, label: s.title }))}
        currentStepIndex={currentStepIndex}
        currentStepId={currentStep.id}
        onStepClick={handleStepClick}
        isFirst={isFirst}
        isLast={isLast}
      />

      {/* Step Title */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{currentStep.title}</h3>
        <p className="text-sm text-muted-foreground">
          Step {currentStepIndex + 1} of {steps.length}
        </p>
      </div>

      {/* Schema Validation Errors */}
      {schemaErrors && schemaErrors.issues.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 mb-4"
        >
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-destructive shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-destructive">
                Validation Failed
              </h4>
              <ul className="mt-2 text-sm text-destructive/90 list-disc list-inside space-y-1">
                {schemaErrors.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.path.length > 0 && (
                      <span className="font-medium">{issue.path.join(".")}: </span>
                    )}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setSchemaErrors(null)}
              className="text-destructive/70 hover:text-destructive shrink-0"
              aria-label="Dismiss errors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Current Step Form */}
      <AutoForm
        key={currentStep.id}
        formSchema={currentStepSchema as z.ZodObject<z.ZodRawShape>}
        values={currentStepValues}
        onValuesChange={handleStepValuesChange}
        onSubmit={handleStepSubmit}
        fieldConfig={currentStepFieldConfig}
        className="space-y-4"
      >
        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={isFirst || isSubmitting}
          >
            {backButtonText}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isLast ? submitButtonText : nextButtonText}
          </Button>
        </div>
        {children}
      </AutoForm>
    </div>
  );
}
