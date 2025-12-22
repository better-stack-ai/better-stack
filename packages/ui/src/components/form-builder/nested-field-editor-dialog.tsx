"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { FolderOpen, List } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Palette, PaletteDragOverlay } from "./palette";
import { Canvas } from "./canvas";
import { FieldDragOverlay } from "./sortable-field";
import { getComponentByType } from "./components";
import { generateFieldId } from "./schema-utils";
import type {
  FormBuilderComponentDefinition,
  FormBuilderField,
  DragData,
  PaletteDragData,
} from "./types";

interface NestedFieldEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The parent field being edited (object or array) */
  field: FormBuilderField | null;
  /** Available component definitions */
  components: FormBuilderComponentDefinition[];
  /** Callback when the nested fields are saved */
  onSave: (fieldId: string, nestedFields: FormBuilderField[]) => void;
}

export function NestedFieldEditorDialog({
  open,
  onOpenChange,
  field,
  components,
  onSave,
}: NestedFieldEditorDialogProps) {
  // Stable ID for nested DndContext
  const dndContextId = useId();

  // Get the nested fields based on field type
  const initialFields = useMemo(() => {
    if (!field) return [];
    if (field.type === "object") return field.children || [];
    if (field.type === "array") return field.itemTemplate || [];
    return [];
  }, [field]);

  // Local state for editing
  const [nestedFields, setNestedFields] = useState<FormBuilderField[]>(initialFields);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Reset local state when field changes or dialog opens
  const [prevField, setPrevField] = useState(field);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevField !== field || (open && !prevOpen)) {
    setPrevField(field);
    setPrevOpen(open);
    setNestedFields(initialFields);
  }
  if (prevOpen !== open) {
    setPrevOpen(open);
  }

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 8 },
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
    const nestedField = nestedFields.find((f) => f.id === idStr);
    if (nestedField) {
      return {
        type: "field",
        field: nestedField,
        component: getComponentByType(nestedField.type, components),
      };
    }

    return null;
  }, [activeId, nestedFields, components]);

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
        };

        // Determine insertion index
        let insertIndex = nestedFields.length;
        const overId = String(over.id);

        if (overId === "drop-zone-start") {
          insertIndex = 0;
        } else if (overId.startsWith("drop-zone-")) {
          const fieldId = overId.replace("drop-zone-", "");
          const overIndex = nestedFields.findIndex((f) => f.id === fieldId);
          if (overIndex !== -1) {
            insertIndex = overIndex + 1;
          }
        } else if (overId !== "canvas") {
          const overIndex = nestedFields.findIndex((f) => f.id === overId);
          if (overIndex !== -1) {
            insertIndex = overIndex + 1;
          }
        }

        const newFields = [...nestedFields];
        newFields.splice(insertIndex, 0, newField);
        setNestedFields(newFields);
      }
      return;
    }

    // Handle field reorder
    if (activeData?.type === "field" && active.id !== over.id) {
      const oldIndex = nestedFields.findIndex((f) => f.id === active.id);
      const newIndex = nestedFields.findIndex((f) => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        setNestedFields(arrayMove(nestedFields, oldIndex, newIndex));
      }
    }
  };

  // Handle delete field
  const handleDeleteField = useCallback((id: string) => {
    setNestedFields((fields) => fields.filter((f) => f.id !== id));
  }, []);

  // Handle edit field (for now just a placeholder - nested editing would need more work)
  const handleEditField = useCallback((_id: string) => {
    // TODO: Could open another dialog for editing nested field properties
    // For now, the fields can be edited through the main form builder after saving
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!field) return;
    onSave(field.id, nestedFields);
    onOpenChange(false);
  }, [field, nestedFields, onSave, onOpenChange]);

  if (!field) return null;

  const isObjectField = field.type === "object";
  const Icon = isObjectField ? FolderOpen : List;
  const fieldTypeLabel = isObjectField ? "Field Group" : "Repeating Group";
  const nestedLabel = isObjectField ? "nested fields" : "item fields";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            Configure {fieldTypeLabel}: {field.props.label}
          </DialogTitle>
          <DialogDescription>
            Add and arrange the {nestedLabel} for this {fieldTypeLabel.toLowerCase()}.
            {isObjectField
              ? " These fields will be grouped together."
              : " Each item in the array will have these fields."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <DndContext
            id={dndContextId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-[50vh] gap-4">
              {/* Palette */}
              <div className="w-48 overflow-auto shrink-0 border-r pr-4">
                <Palette components={components} />
              </div>

              {/* Canvas */}
              <div className="flex-1 overflow-auto">
                <Canvas
                  fields={nestedFields}
                  components={components}
                  onEditField={handleEditField}
                  onDeleteField={handleDeleteField}
                  isDraggingFromPalette={activeDragData?.type === "palette"}
                  // Nested fields don't support steps - pass empty/no-op handlers
                  steps={[]}
                  activeStepIndex={0}
                  onActiveStepChange={() => {}}
                  onAddStep={() => {}}
                  onDeleteStep={() => {}}
                  onRenameStep={() => {}}
                />
              </div>
            </div>

            {/* Drag Overlay - rendered in portal to escape dialog's transform context */}
            {typeof document !== "undefined" &&
              createPortal(
                <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                  {activeDragData?.type === "palette" && activeDragData.component && (
                    <PaletteDragOverlay component={activeDragData.component} />
                  )}
                  {activeDragData?.type === "field" && activeDragData.field && (
                    <FieldDragOverlay
                      field={activeDragData.field}
                      component={activeDragData.component}
                    />
                  )}
                </DragOverlay>,
                document.body
              )}
          </DndContext>
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
            {nestedFields.length} {nestedFields.length === 1 ? "field" : "fields"}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Fields</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
