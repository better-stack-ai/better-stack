import type { PluginKey } from "../types";

/**
 * Applies dependency-injection rules to a raw plugin selection:
 *   - `ui-builder` requires `cms` — inject it if missing.
 *
 * This function is the single source of truth for inter-plugin dependencies.
 * Callers (btst init, playground) may add further app-specific rules on top
 * (e.g. the playground always appends `route-docs`).
 */
export function normalizePlugins(selected: PluginKey[]): PluginKey[] {
	if (selected.includes("ui-builder") && !selected.includes("cms")) {
		return ["cms", ...selected] as PluginKey[];
	}
	return selected;
}
