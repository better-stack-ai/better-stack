import type { PluginKey } from "@btst/codegen/lib";

/**
 * Applies auto-inclusion rules to a raw plugin selection:
 * - `ui-builder` requires `cms`
 * - `route-docs` is always included
 *
 * Used by both the server action (generateProject) and the client-side
 * route preview so the two stay in sync.
 */
export function getEffectivePlugins(selected: PluginKey[]): PluginKey[] {
	const withCms =
		selected.includes("ui-builder") && !selected.includes("cms")
			? (["cms", ...selected] as PluginKey[])
			: selected;
	return withCms.includes("route-docs")
		? withCms
		: ([...withCms, "route-docs"] as PluginKey[]);
}
