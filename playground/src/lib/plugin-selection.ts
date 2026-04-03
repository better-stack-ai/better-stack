import { normalizePlugins } from "@btst/codegen/lib";
import type { PluginKey } from "@btst/codegen/lib";

/**
 * Applies auto-inclusion rules to a raw plugin selection:
 * - `ui-builder` requires `cms` (delegated to normalizePlugins)
 * - `route-docs` is always included
 *
 * Used by both the server action (generateProject) and the client-side
 * route preview so the two stay in sync.
 */
export function getEffectivePlugins(selected: PluginKey[]): PluginKey[] {
	const normalized = normalizePlugins(selected);
	return normalized.includes("route-docs")
		? normalized
		: ([...normalized, "route-docs"] as PluginKey[]);
}
