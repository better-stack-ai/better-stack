"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, Settings2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import type { FormBuilderField, FormBuilderComponentDefinition, FieldDragData } from "./types";

interface SortableFieldProps {
  field: FormBuilderField;
  index: number;
  component: FormBuilderComponentDefinition | undefined;
  onEdit: () => void;
  onDelete: () => void;
  /** Callback to configure nested fields for object/array types */
  onConfigureNested?: () => void;
}

export function SortableField({
  field,
  index,
  component,
  onEdit,
  onDelete,
  onConfigureNested,
}: SortableFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
    data: {
      type: "field",
      fieldId: field.id,
      index,
    } satisfies FieldDragData,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = component?.icon as React.ComponentType<{ className?: string }> | undefined;
  
  // Check if this is a container field (object or array)
  const isContainerField = field.type === "object" || field.type === "array";
  const nestedFieldCount = field.type === "object" 
    ? (field.children?.length || 0)
    : (field.itemTemplate?.length || 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 p-3 rounded-lg border bg-card",
        "transition-all duration-200",
        isDragging && "opacity-50 shadow-lg z-50",
        !isDragging && "hover:border-muted-foreground/30"
      )}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "flex items-center justify-center p-1 rounded cursor-grab active:cursor-grabbing",
          "hover:bg-muted touch-none",
          "min-w-[44px] min-h-[44px] -m-1"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Field Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{field.props.label}</span>
          {field.props.required && (
            <span className="text-destructive text-sm">*</span>
          )}
          {isContainerField && (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {nestedFieldCount} {nestedFieldCount === 1 ? "field" : "fields"}
            </span>
          )}
        </div>
        {field.props.description && (
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {field.props.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground/60 mt-1">
          {component?.label || field.type}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        {/* Configure Nested Fields button for container types */}
        {isContainerField && onConfigureNested && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-primary",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "min-w-[44px] min-h-[44px]"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onConfigureNested();
            }}
            title="Configure nested fields"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-primary",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "min-w-[44px] min-h-[44px]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-destructive",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "min-w-[44px] min-h-[44px]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface FieldDragOverlayProps {
  field: FormBuilderField;
  component: FormBuilderComponentDefinition | undefined;
}

export function FieldDragOverlay({ field, component }: FieldDragOverlayProps) {
  const Icon = component?.icon as React.ComponentType<{ className?: string }> | undefined;

  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border bg-card shadow-lg cursor-grabbing">
      <div className="p-1">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="font-medium truncate">{field.props.label}</span>
        </div>
      </div>
    </div>
  );
}
