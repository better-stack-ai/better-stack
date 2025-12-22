"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import type { FormStep } from "./types";

interface StepTabsProps {
  steps: FormStep[];
  activeStepIndex: number;
  onActiveStepChange: (index: number) => void;
  onAddStep: () => void;
  onDeleteStep: (index: number) => void;
  onRenameStep: (index: number, newTitle: string) => void;
  className?: string;
}

export function StepTabs({
  steps,
  activeStepIndex,
  onActiveStepChange,
  onAddStep,
  onDeleteStep,
  onRenameStep,
  className,
}: StepTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (index: number, currentTitle: string) => {
    setEditingIndex(index);
    setEditValue(currentTitle);
  };

  const handleConfirmEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      onRenameStep(editingIndex, editValue.trim());
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // If there's only one step, don't show the step tabs UI
  if (steps.length <= 1) {
    return (
      <div className={cn("flex items-center gap-2 mb-4", className)}>
        <Button
          variant="outline"
          size="sm"
          onClick={onAddStep}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
        <span className="text-sm text-muted-foreground">
          Add a step to create a multi-step form
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 mb-4 flex-wrap", className)}>
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={cn(
            "group flex items-center gap-1 px-3 py-1.5 rounded-md border transition-colors",
            activeStepIndex === index
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card hover:bg-muted border-border"
          )}
        >
          {editingIndex === index ? (
            <div className="flex items-center gap-1">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-6 w-24 text-sm px-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleConfirmEdit}
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCancelEdit}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onActiveStepChange(index)}
                className="text-sm font-medium"
              >
                {step.title}
              </button>
              <div
                className={cn(
                  "flex items-center gap-0.5 ml-1",
                  activeStepIndex === index
                    ? "opacity-70 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                )}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5",
                    activeStepIndex === index
                      ? "hover:bg-primary-foreground/20 text-primary-foreground"
                      : "hover:bg-muted-foreground/20"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(index, step.title);
                  }}
                  title="Rename step"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-5 w-5",
                    activeStepIndex === index
                      ? "hover:bg-destructive/20 text-primary-foreground"
                      : "hover:bg-destructive/20 hover:text-destructive"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteStep(index);
                  }}
                  title="Delete step"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={onAddStep}
        className="gap-1 h-8"
      >
        <Plus className="h-4 w-4" />
        Add Step
      </Button>
    </div>
  );
}

