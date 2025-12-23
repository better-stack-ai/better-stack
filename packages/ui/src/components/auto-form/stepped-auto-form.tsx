"use client";

import React, { useState, useMemo, useCallback } from "react";
import { z } from "zod";
import AutoForm from "./index";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { cn } from "@workspace/ui/lib/utils";
import type { FieldConfig } from "./types";
import type { ZodObjectOrWrapped } from "./utils";

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
  onSubmit?: (values: z.infer<SchemaType>) => void;
  fieldConfig?: FieldConfig<z.infer<SchemaType>>;
  children?: React.ReactNode;
  className?: string;

  // Stepper customization
  nextButtonText?: string;
  backButtonText?: string;
  submitButtonText?: string;
  StepperComponent?: React.ComponentType<StepperComponentProps>;
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
  onSubmit,
  fieldConfig,
  children,
  className,
  nextButtonText = "Next",
  backButtonText = "Back",
  submitButtonText = "Submit",
  StepperComponent = DefaultStepper,
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
      }
    },
    [steps, currentStepIndex, completedSteps]
  );

  // Handle step submission - AutoForm validates per-step, we just accumulate and track completion
  const handleStepSubmit = useCallback(
    (stepValues: Record<string, unknown>) => {
      // AutoForm has already validated the current step's fields via zodResolver
      const newAccumulated = { ...accumulatedValues, ...stepValues };
      setAccumulatedValues(newAccumulated);
      
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
          onSubmit?.(parseResult.data as z.infer<SchemaType>);
        }
        // If validation fails, don't submit - user needs to fix issues
      } else {
        // Move to next step
        setCurrentStepIndex((prev) => prev + 1);
      }
    },
    [accumulatedValues, isLast, onSubmit, currentStepIndex, steps, completedSteps, formSchema]
  );

  // Handle back button
  const handleBack = useCallback(() => {
    if (!isFirst) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [isFirst]);

  // If no multiple steps, delegate to regular AutoForm
  if (!hasMultipleSteps) {
    return (
      <AutoForm
        formSchema={formSchema}
        values={initialValues}
        onSubmit={onSubmit}
        fieldConfig={fieldConfig}
        className={className}
      >
        {children ?? (
          <Button type="submit" className="w-full mt-4">
            {submitButtonText}
          </Button>
        )}
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

      {/* Current Step Form */}
      <AutoForm
        key={currentStep.id}
        formSchema={currentStepSchema as z.ZodObject<z.ZodRawShape>}
        values={currentStepValues}
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
            disabled={isFirst}
          >
            {backButtonText}
          </Button>
          <Button type="submit">
            {isLast ? submitButtonText : nextButtonText}
          </Button>
        </div>
        {children}
      </AutoForm>
    </div>
  );
}

export default SteppedAutoForm;
export { SteppedAutoForm };
export type { SteppedAutoFormProps, StepperComponentProps };

