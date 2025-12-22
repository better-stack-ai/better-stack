"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@workspace/ui/lib/utils";
import type { FormBuilderComponentDefinition, PaletteDragData } from "./types";

interface PaletteItemProps {
  component: FormBuilderComponentDefinition;
}

function PaletteItem({ component }: PaletteItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${component.type}`,
    data: {
      type: "palette",
      componentType: component.type,
    } satisfies PaletteDragData,
  });

  const Icon = component.icon as React.ComponentType<{ className?: string }>;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border bg-card cursor-grab active:cursor-grabbing",
        "hover:bg-accent hover:border-accent-foreground/20 transition-colors",
        "touch-none select-none",
        isDragging && "opacity-50"
      )}
    >
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-sm font-medium">{component.label}</span>
    </div>
  );
}

interface PaletteProps {
  components: FormBuilderComponentDefinition[];
  className?: string;
}

export function Palette({ components, className }: PaletteProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">
        Components
      </h3>
      <div className="flex flex-row flex-wrap lg:flex-col gap-2">
        {components.map((component) => (
          <PaletteItem key={component.type} component={component} />
        ))}
      </div>
    </div>
  );
}

interface PaletteDragOverlayProps {
  component: FormBuilderComponentDefinition | null;
}

export function PaletteDragOverlay({ component }: PaletteDragOverlayProps) {
  if (!component) return null;

  const Icon = component.icon as React.ComponentType<{ className?: string }>;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card shadow-lg cursor-grabbing">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-sm font-medium">{component.label}</span>
    </div>
  );
}
