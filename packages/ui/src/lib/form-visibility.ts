/** A single visibility condition against a sibling field's value. */
export type ShowIfCondition = {
  field: string;
  operator: "equals" | "notEquals" | "in" | "isTruthy";
  value?: unknown;
};

/** Evaluate a form visibility rule without coercing the comparison value. */
export function matchesShowIf(condition: ShowIfCondition | undefined, values: Record<string, unknown>): boolean {
  if (!condition) return true;
  const value = Object.hasOwn(values, condition.field) ? values[condition.field] : undefined;
  switch (condition.operator) {
    case "equals": return value === condition.value;
    case "notEquals": return value !== condition.value;
    case "in": return Array.isArray(condition.value) && condition.value.includes(value);
    case "isTruthy": return Boolean(value);
    default: return false;
  }
}
