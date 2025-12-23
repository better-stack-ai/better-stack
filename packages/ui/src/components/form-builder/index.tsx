"use client";

import { useCallback, useId, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { cn } from "@workspace/ui/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

import { Palette, PaletteDragOverlay } from "./palette";
import { Canvas } from "./canvas";
import { EditFieldDialog } from "./edit-field-dialog";
import { NestedFieldEditorDialog } from "./nested-field-editor-dialog";
import { FormPreview } from "./form-preview";
import { FieldDragOverlay } from "./sortable-field";
import { defaultComponents, getComponentByType } from "./components";
import { fieldsToJSONSchema, jsonSchemaToFieldsAndSteps, generateFieldId, createStep } from "./schema-utils";
import type {
  FormBuilderComponentDefinition,
  FormBuilderField,
  FormBuilderFieldProps,
  FormStep,
  JSONSchema,
  DragData,
  PaletteDragData,
} from "./types";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

// Re-export types and components for external use
export { defaultComponents, objectFieldDefinition, arrayFieldDefinition } from "./components";
export { defineComponent } from "./types";
export { baseMetaSchema, baseMetaSchemaWithPlaceholder } from "./validation-schemas";
export type {
  FormBuilderComponentDefinition,
  FormBuilderField,
  FormBuilderFieldProps,
  JSONSchema,
  JSONSchemaProperty,
  StringFieldProps,
} from "./types";

interface FormBuilderProps {
  /** Available components to use in the form builder */
  components?: FormBuilderComponentDefinition[];
  /** Current form schema (JSON Schema format) */
  value?: JSONSchema;
  /** Callback when form schema changes */
  onChange?: (schema: JSONSchema) => void;
  /** Additional CSS classes */
  className?: string;
  /** 
   * Custom field components for the form preview.
   * Maps fieldType names to React components that render the field.
   * These are merged with the default custom components (like color picker).
   * 
   * @example
   * ```tsx
   * <FormBuilder
   *   fieldComponents={{
   *     rating: RatingComponent,
   *     signature: SignatureComponent,
   *   }}
   * />
   * ```
   */
  fieldComponents?: Record<string, React.ComponentType<AutoFormInputComponentProps>>;
  /**
   * Default values to pre-populate the form preview with.
   * Useful for edit scenarios where the form should start with existing data.
   * 
   * @example
   * ```tsx
   * <FormBuilder
   *   defaultValues={{
   *     username: "johndoe",
   *     email: "john@example.com",
   *   }}
   * />
   * ```
   */
  defaultValues?: Record<string, unknown>;
}

export function FormBuilder({
  components = defaultComponents,
  value,
  onChange,
  className,
  fieldComponents,
  defaultValues,
}: FormBuilderProps) {
  // Stable ID for DndContext to prevent hydration mismatch
  const dndContextId = useId();
  
  // Internal state - initialized from value prop if provided
  // Note: To reset fields from parent, use a key prop on FormBuilder
  const [fields, setFields] = useState<FormBuilderField[]>(() => {
    if (!value) return [];
    const { fields: parsedFields } = jsonSchemaToFieldsAndSteps(value, components);
    return parsedFields;
  });
  
  // Steps state for multi-step forms
  const [steps, setSteps] = useState<FormStep[]>(() => {
    if (!value) return [];
    const { steps: parsedSteps } = jsonSchemaToFieldsAndSteps(value, components);
    return parsedSteps;
  });
  
  // Active step index for canvas filtering
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  
  const [editDialogFieldId, setEditDialogFieldId] = useState<string | null>(null);
  const [nestedEditorFieldId, setNestedEditorFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Notify onChange when fields or steps change
  const notifyChange = useCallback(
    (newFields: FormBuilderField[], newSteps?: FormStep[]) => {
      if (onChange) {
        const schema = fieldsToJSONSchema(newFields, components, newSteps ?? steps);
        onChange(schema);
      }
    },
    [onChange, components, steps]
  );

  // Get current JSON Schema for preview
  const currentSchema = useMemo(
    () => fieldsToJSONSchema(fields, components, steps),
    [fields, components, steps]
  );

  // Sensors for dnd-kit with touch support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        // Use distance instead of delay for better compatibility with
        // automated testing tools and faster touch interactions
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Determine what's being dragged
  const activeDragData = useMemo(() => {
    if (!activeId) return null;

    const idStr = String(activeId);

    // Check if it's a palette item
    if (idStr.startsWith("palette-")) {
      const componentType = idStr.replace("palette-", "");
      return {
        type: "palette",
        componentType,
        component: getComponentByType(componentType, components),
      };
    }

    // Otherwise it's a field
    const field = fields.find((f) => f.id === idStr);
    if (field) {
      return {
        type: "field",
        field,
        component: getComponentByType(field.type, components),
      };
    }

    return null;
  }, [activeId, fields, components]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeData = active.data.current as DragData | undefined;

    // Handle palette item drop
    if (activeData?.type === "palette") {
      const { componentType } = activeData as PaletteDragData;
      const component = getComponentByType(componentType, components);

      if (component) {
        const newField: FormBuilderField = {
          id: generateFieldId(componentType),
          type: componentType,
          props: {
            label: component.defaultProps.label || component.label,
            ...component.defaultProps,
          },
          // Assign to active step when in multi-step mode
          ...(steps.length > 1 ? { stepGroup: activeStepIndex } : {}),
        };

        // Determine insertion index based on where item was dropped
        let insertIndex = fields.length;
        const overId = String(over.id);
        
        if (overId === "drop-zone-start") {
          // Dropped at the beginning
          insertIndex = 0;
        } else if (overId.startsWith("drop-zone-")) {
          // Dropped after a specific field
          const fieldId = overId.replace("drop-zone-", "");
          const overIndex = fields.findIndex((f) => f.id === fieldId);
          if (overIndex !== -1) {
            insertIndex = overIndex + 1;
          }
        } else if (overId !== "canvas") {
          // Dropped directly on a field
          const overIndex = fields.findIndex((f) => f.id === overId);
          if (overIndex !== -1) {
            insertIndex = overIndex + 1;
          }
        }

        const newFields = [...fields];
        newFields.splice(insertIndex, 0, newField);
        setFields(newFields);
        notifyChange(newFields);
      }
      return;
    }

    // Handle field reorder
    if (activeData?.type === "field" && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newFields = arrayMove(fields, oldIndex, newIndex);
        setFields(newFields);
        notifyChange(newFields);
      }
    }
  };

  // Update field props (with optional ID change and step group)
  const handleUpdateField = useCallback(
    (id: string, props: Partial<FormBuilderFieldProps>, newId?: string, stepGroup?: number) => {
      // Validate that the new ID doesn't already exist on another field
      if (newId && newId !== id) {
        const idExists = fields.some((f) => f.id === newId && f.id !== id);
        if (idExists) {
          // Reject the update - duplicate ID would cause data loss
          console.warn(`Cannot rename field "${id}" to "${newId}": a field with that ID already exists`);
          return;
        }
      }
      
      const newFields = fields.map((f) => {
        if (f.id !== id) return f;
        const updated: FormBuilderField = { 
          ...f, 
          id: newId || f.id, 
          props: { ...f.props, ...props } 
        };
        // Only update stepGroup if explicitly provided (not undefined)
        if (stepGroup !== undefined) {
          updated.stepGroup = stepGroup;
        }
        return updated;
      });
      setFields(newFields);
      notifyChange(newFields);
    },
    [fields, notifyChange]
  );

  // Open edit dialog for a field
  const handleEditField = useCallback((id: string) => {
    setEditDialogFieldId(id);
  }, []);

  // Delete field
  const handleDeleteField = useCallback(
    (id: string) => {
      const newFields = fields.filter((f) => f.id !== id);
      setFields(newFields);
      notifyChange(newFields);
    },
    [fields, notifyChange]
  );

  // Open nested field editor for object/array fields
  const handleConfigureNested = useCallback((id: string) => {
    setNestedEditorFieldId(id);
  }, []);

  // Save nested fields (children for object, itemTemplate for array)
  const handleSaveNestedFields = useCallback(
    (fieldId: string, nestedFields: FormBuilderField[]) => {
      const newFields = fields.map((f) => {
        if (f.id !== fieldId) return f;
        
        if (f.type === "object") {
          return { ...f, children: nestedFields };
        } else if (f.type === "array") {
          return { ...f, itemTemplate: nestedFields };
        }
        return f;
      });
      setFields(newFields);
      notifyChange(newFields);
    },
    [fields, notifyChange]
  );

  // ============================================================================
  // STEP HANDLERS
  // ============================================================================

  // Add a new step
  const handleAddStep = useCallback(() => {
    const newStep = createStep(steps.length);
    const newSteps = [...steps, newStep];
    
    // If this is the second step, we need to assign all existing fields to step 0
    if (steps.length === 1) {
      const updatedFields = fields.map((f) => ({ ...f, stepGroup: 0 }));
      setFields(updatedFields);
      setSteps(newSteps);
      notifyChange(updatedFields, newSteps);
    } else if (steps.length === 0) {
      // First step - create two steps (Step 1 and Step 2)
      const firstStep = createStep(0);
      const secondStep = createStep(1);
      const bothSteps = [firstStep, secondStep];
      const updatedFields = fields.map((f) => ({ ...f, stepGroup: 0 }));
      setFields(updatedFields);
      setSteps(bothSteps);
      notifyChange(updatedFields, bothSteps);
    } else {
      setSteps(newSteps);
      notifyChange(fields, newSteps);
    }
  }, [steps, fields, notifyChange]);

  // Delete a step
  const handleDeleteStep = useCallback(
    (index: number) => {
      if (steps.length <= 2) {
        // Going from 2 steps to single-step mode
        // Remove stepGroup from all fields
        const updatedFields = fields.map((f) => {
          const { stepGroup: _, ...rest } = f;
          return rest;
        });
        setFields(updatedFields);
        setSteps([]);
        setActiveStepIndex(0);
        notifyChange(updatedFields, []);
      } else {
        // Remove the step and delete fields that belonged to it
        const newSteps = steps.filter((_, i) => i !== index);
        const updatedFields = fields
          .filter((f) => f.stepGroup !== index) // Remove fields from deleted step
          .map((f) => {
            if (f.stepGroup !== undefined && f.stepGroup > index) {
              // Decrement stepGroup for fields after the deleted step
              return { ...f, stepGroup: f.stepGroup - 1 };
            }
            return f;
          });
        setFields(updatedFields);
        setSteps(newSteps);
        // Adjust active step if needed
        if (activeStepIndex >= newSteps.length) {
          setActiveStepIndex(newSteps.length - 1);
        }
        notifyChange(updatedFields, newSteps);
      }
    },
    [steps, fields, activeStepIndex, notifyChange]
  );

  // Rename a step
  const handleRenameStep = useCallback(
    (index: number, newTitle: string) => {
      const newSteps = steps.map((step, i) =>
        i === index ? { ...step, title: newTitle } : step
      );
      setSteps(newSteps);
      notifyChange(fields, newSteps);
    },
    [steps, fields, notifyChange]
  );

  // Get edit dialog field and its component
  const editDialogField = fields.find((f) => f.id === editDialogFieldId) || null;
  const editDialogComponent = editDialogField
    ? getComponentByType(editDialogField.type, components) || null
    : null;

  // Get nested editor field
  const nestedEditorField = fields.find((f) => f.id === nestedEditorFieldId) || null;

  return (
    <div className={cn("flex flex-col lg:h-full", className)}>
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Mobile: stack vertically and allow page scroll. Desktop: horizontal layout with overflow */}
        <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
          {/* Palette */}
          <div className="w-full lg:w-64 p-4 border-b lg:border-b-0 lg:border-r lg:overflow-auto shrink-0">
            <Palette components={components} />
          </div>

          {/* Canvas */}
          <div className="flex-1 p-4 lg:overflow-auto min-h-[300px]">
            <Canvas
              fields={fields}
              components={components}
              onEditField={handleEditField}
              onDeleteField={handleDeleteField}
              onConfigureNested={handleConfigureNested}
              isDraggingFromPalette={activeDragData?.type === "palette"}
              steps={steps}
              activeStepIndex={activeStepIndex}
              onActiveStepChange={setActiveStepIndex}
              onAddStep={handleAddStep}
              onDeleteStep={handleDeleteStep}
              onRenameStep={handleRenameStep}
            />
          </div>

          {/* Right Panel with Tabs */}
          <div className="w-full flex-1 lg:w-96 border-t lg:border-t-0 lg:border-l lg:overflow-auto min-h-[300px]">
            <Tabs defaultValue="preview" className="h-full flex flex-col">
              <div className="p-4 border-b">
                <TabsList className="w-full">
                  <TabsTrigger value="preview" className="flex-1">
                    Preview
                  </TabsTrigger>
                  <TabsTrigger value="schema" className="flex-1">
                    JSON Schema
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="preview" className="flex-1 m-0 lg:overflow-auto">
                <FormPreview schema={currentSchema} fieldComponents={fieldComponents} defaultValues={defaultValues} />
              </TabsContent>
              <TabsContent value="schema" className="flex-1 m-0 p-4 lg:overflow-auto">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <pre className="text-sm overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(currentSchema, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeDragData?.type === "palette" && activeDragData.component && (
            <PaletteDragOverlay component={activeDragData.component} />
          )}
          {activeDragData?.type === "field" && activeDragData.field && (
            <FieldDragOverlay
              field={activeDragData.field}
              component={activeDragData.component}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Edit Field Dialog */}
      <EditFieldDialog
        open={editDialogFieldId !== null}
        onOpenChange={(open) => !open && setEditDialogFieldId(null)}
        field={editDialogField}
        component={editDialogComponent}
        onUpdate={handleUpdateField}
        steps={steps}
        allFieldIds={fields.map((f) => f.id)}
      />

      {/* Nested Field Editor Dialog */}
      <NestedFieldEditorDialog
        open={nestedEditorFieldId !== null}
        onOpenChange={(open) => !open && setNestedEditorFieldId(null)}
        field={nestedEditorField}
        components={components}
        onSave={handleSaveNestedFields}
      />
    </div>
  );
}

export default FormBuilder;
