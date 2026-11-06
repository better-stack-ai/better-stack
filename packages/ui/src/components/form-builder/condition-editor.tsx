"use client";

import { useId } from "react";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import type { ShowIfCondition } from "@workspace/ui/lib/form-visibility";

/** Edit one field or step visibility condition. */
export function ConditionEditor({ value, onChange, fieldIds }: {
  value?: ShowIfCondition;
  onChange: (condition: ShowIfCondition | undefined) => void;
  fieldIds: string[];
}) {
  const id = useId();
  const ValueInput = value?.operator === "in" ? Textarea : Input;
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Visibility</legend>
      <Label htmlFor={`${id}-field`}>Show if field</Label>
      <Select value={value?.field ?? "__always"} onValueChange={field => onChange(field === "__always" ? undefined : { field, operator: "isTruthy" })}>
        <SelectTrigger id={`${id}-field`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__always">Always show</SelectItem>
          {fieldIds.map(field => <SelectItem key={field} value={field}>{field}</SelectItem>)}
        </SelectContent>
      </Select>
      {value && <>
        <Label htmlFor={`${id}-operator`}>Condition</Label>
        <Select value={value.operator} onValueChange={operator => onChange({ ...value, operator: operator as ShowIfCondition["operator"], value: operator === "in" ? [] : "" })}>
          <SelectTrigger id={`${id}-operator`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Equals</SelectItem>
            <SelectItem value="notEquals">Does not equal</SelectItem>
            <SelectItem value="in">Is one of</SelectItem>
            <SelectItem value="isTruthy">Has a truthy value</SelectItem>
          </SelectContent>
        </Select>
        {value.operator !== "isTruthy" && <>
          <Label htmlFor={`${id}-value`}>{value.operator === "in" ? "Values (one per line)" : "Value"}</Label>
          <ValueInput id={`${id}-value`} value={value.operator === "in" ? (Array.isArray(value.value) ? value.value.map(item => typeof item === "string" ? JSON.stringify(item) : String(item)).join("\n") : "") : typeof value.value === "string" ? value.value : JSON.stringify(value.value) ?? ""}
            onChange={event => {
              const parse = (text: string) => { try { return JSON.parse(text); } catch { return text; } };
              onChange({ ...value, value: value.operator === "in" ? event.target.value.split("\n").map(text => parse(text.trim())) : parse(event.target.value) });
            }} />
          <p className="text-xs text-muted-foreground">{value.operator === "in" ? "Enter one value per line. " : ""}Numbers, true and false are compared as typed values. Quote them to compare text.</p>
        </>}
      </>}
    </fieldset>
  );
}
