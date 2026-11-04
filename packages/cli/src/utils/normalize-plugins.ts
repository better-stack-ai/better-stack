import type { PluginKey } from "../types";

/**
 * Applies dependency-injection rules to a raw plugin selection:
 *   - `crm` requires `kanban` — inject it if missing.
 *   - `ui-builder`, `job-board`, and `school` require `cms` — inject it if missing.
 *
 * This function is the single source of truth for inter-plugin dependencies.
 * Callers (btst init, playground) may add further app-specific rules on top
 * (e.g. the playground always appends `route-docs`).
 */
export function normalizePlugins(selected: PluginKey[]): PluginKey[] {
	if (selected.includes("crm") && !selected.includes("kanban")) {
		selected = ["kanban", ...selected];
	}
	if (
		(selected.includes("ui-builder") ||
			selected.includes("job-board") ||
			selected.includes("school")) &&
		!selected.includes("cms")
	) {
		return ["cms", ...selected] as PluginKey[];
	}
	return selected;
}
