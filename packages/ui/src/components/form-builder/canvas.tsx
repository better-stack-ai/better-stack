"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@workspace/ui/lib/utils";
import { SortableField } from "./sortable-field";
import { StepTabs } from "./step-tabs";
import type { FormBuilderField, FormBuilderComponentDefinition, FormStep } from "./types";

interface DropZoneProps {
  id: string;
  isDraggingFromPalette: boolean;
}

function DropZone({ id, isDraggingFromPalette }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  if (!isDraggingFromPalette) {
    return null;
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-2 rounded-full transition-all duration-200",
        isOver
          ? "h-3 bg-primary animate-pulse"
          : "bg-muted-foreground/20"
      )}
    />
  );
}

interface CanvasProps {
  fields: FormBuilderField[];
  components: FormBuilderComponentDefinition[];
  onEditField: (id: string) => void;
  onDeleteField: (id: string) => void;
  /** Callback to configure nested fields for object/array types */
  onConfigureNested?: (id: string) => void;
  isDraggingFromPalette: boolean;
  className?: string;
  /** Steps for multi-step forms */
  steps: FormStep[];
  /** Currently active step index */
  activeStepIndex: number;
  /** Callback when active step changes */
  onActiveStepChange: (index: number) => void;
  /** Callback to add a new step */
  onAddStep: () => void;
  /** Callback to delete a step */
  onDeleteStep: (index: number) => void;
  /** Callback to rename a step */
  onRenameStep: (index: number, newTitle: string) => void;
  /** Hide all step controls (used in nested field editor) */
  hideStepControls?: boolean;
}

export function Canvas({
  fields,
  components,
  onEditField,
  onDeleteField,
  onConfigureNested,
  isDraggingFromPalette,
  className,
  steps,
  activeStepIndex,
  onActiveStepChange,
  onAddStep,
  onDeleteStep,
  onRenameStep,
  hideStepControls,
}: CanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "canvas",
  });

  const getComponent = (type: string) =>
    components.find((c) => c.type === type);

  // Filter fields by active step when there are multiple steps
  const visibleFields = useMemo(() => {
    if (steps.length <= 1) {
      // Single step mode - show all fields
      return fields;
    }
    // Multi-step mode - filter by activeStepIndex
    return fields.filter((f) => (f.stepGroup ?? 0) === activeStepIndex);
  }, [fields, steps.length, activeStepIndex]);

  // For sortable context, we only use visible fields
  const sortableItems = useMemo(() => visibleFields.map((f) => f.id), [visibleFields]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Step Tabs */}
      <StepTabs
        steps={steps}
        activeStepIndex={activeStepIndex}
        onActiveStepChange={onActiveStepChange}
        onAddStep={onAddStep}
        onDeleteStep={onDeleteStep}
        onRenameStep={onRenameStep}
        hideStepControls={hideStepControls}
      />

      {/* Canvas Drop Area */}
      <div
        ref={setNodeRef}
        data-testid="form-builder-canvas"
        className={cn(
          "flex-1 p-4 rounded-lg border-2 border-dashed min-h-[400px] transition-colors",
          isOver && isDraggingFromPalette
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20"
        )}
      >
        {visibleFields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground"  data-testid="canvas-drop-zone">
            <p className="text-lg font-medium">Drop components here</p>
            <p className="text-sm">
              {steps.length > 1
                ? `Drag components from the palette to add to ${steps[activeStepIndex]?.title || "this step"}`
                : "Drag components from the palette to build your form"}
            </p>
          </div>
        ) : (
          <SortableContext
            items={sortableItems}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {/* Drop zone at the beginning */}
              <DropZone id="drop-zone-start" isDraggingFromPalette={isDraggingFromPalette} />
              
              {visibleFields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <SortableField
                    field={field}
                    index={index}
                    component={getComponent(field.type)}
                    onEdit={() => onEditField(field.id)}
                    onDelete={() => onDeleteField(field.id)}
                    onConfigureNested={onConfigureNested ? () => onConfigureNested(field.id) : undefined}
                  />
                  {/* Drop zone after each field */}
                  <DropZone id={`drop-zone-${field.id}`} isDraggingFromPalette={isDraggingFromPalette} />
                </div>
              ))}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}
